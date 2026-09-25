-- =============================================================================
-- 0003: triggery (docs/NASAZENI.md, kolo R2)
--
-- Přepis triggerů z PostgreSQL (větev `supabase`). V SQL Serveru nejsou
-- BEFORE ani řádkové triggery; všechno je AFTER nad celou sadou řádků
-- (`inserted` / `deleted`). Z toho plynou pravidla celého souboru:
--
--   * Zámek, který v PostgreSQL běžel BEFORE a hlásil chybu, tady běží AFTER
--     a THROW vrátí celý příkaz i transakci. Výsledek je stejný - nic se
--     nezapíše. Zámky jsou nastavené jako první (sp_settriggerorder 'First').
--   * Rozhoduje se podle STARÝCH hodnot z `deleted`, ne podle tabulky - v ní už
--     je nová hodnota.
--   * Razítka (vytvoreno_at, zmeneno_at) a audit dělá jeden generovaný trigger
--     `<tabulka>_zmena` (dbo.vytvor_auditni_trigger), nastavený jako poslední.
--     Razítko je vnořený UPDATE téže tabulky; jeho vlastní trigger znovu
--     nespustí RECURSIVE_TRIGGERS OFF (a pojistka trigger_nestlevel), ostatní
--     triggery té tabulky ho poznají přes
--     `trigger_nestlevel(object_id(N'dbo.<tabulka>_zmena')) > 0` a skončí -
--     jinak by zámek uzavřené zakázky odmítl razítko, které přišlo po jejím
--     uzavření.
--
-- Čísla chyb (src/lib/db/chyby.ts podle řad):
--   50001 cizí zápis v deníku          50101 parametr mimo schéma
--   50002 zápis starší 24 h             50102 parametr špatného typu
--   50003 fotky k cizímu zápisu         50103 povinný parametr chybí
--   50004 fotky ke staršímu zápisu      50111 aktivovanou verzi nelze smazat
--                                       50112 aktivovaná verze je neměnná
--                                       50113 matice jen v návrhu verze
--                                       50121 zakázky se nemažou
--                                       50122 uzavřená zakázka
--                                       50123 checklist uzavřené zakázky
--                                       50124 zadání kontrolních bodů se nemění
--                                       50125 fotky uzavřené zakázky
--                                       50131 zápis v deníku se nemaže
--                                       50132 zásah zapsaný dopředu
--
-- Kaskády volají dbo.srovnej_plan z 0004; SQL Server dovolí trigger založit
-- dřív než proceduru (odložené rozlišení jmen).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Generátor razítek a auditu (dřív nastav_zmeneno_at + audit_zmeny)
--
-- Pro tabulku vygeneruje trigger `<tabulka>_zmena`, který
--   1. při INSERT nastaví vytvoreno_at i zmeneno_at na teď (co poslal klient,
--      se přepíše - sloupcový GRANT na INSERT SQL Server nemá), při UPDATE
--      vrátí vytvoreno_at na původní hodnotu a zmeneno_at nastaví na teď;
--   2. zapíše do audit_log jeden řádek na změněný řádek ve stejném tvaru jako
--      PostgreSQL (to_jsonb): GUID malými písmeny, časy ISO s `Z`, JSON sloupce
--      jako vnořený JSON, NULL jako null. Obrazovka /audit (rozdil.ts,
--      popisky.ts) tak zůstává beze změny.
--
-- zaznam_id = první existující z id, uzivatel_id, zarizeni_id (jako dřív).
-- Po každém ALTER TABLE auditované tabulky se musí pustit znovu
-- (`exec dbo.vytvor_auditni_trigger N'<tabulka>'`) - seznam sloupců je
-- vygenerovaný napevno.
-- -----------------------------------------------------------------------------

create procedure dbo.vytvor_auditni_trigger
  @tabulka sysname
as
begin
  set nocount on;

  declare @obj int = object_id(N'dbo.' + quotename(@tabulka), N'U');
  if @obj is null
    throw 50300, N'vytvor_auditni_trigger: taková tabulka v dbo není.', 1;

  declare @t       nvarchar(300) = N'dbo.' + quotename(@tabulka);
  declare @nazev   sysname       = @tabulka + N'_zmena';
  declare @trigger nvarchar(300) = N'dbo.' + quotename(@nazev);
  declare @literal nvarchar(300) = N'N''' + replace(@tabulka, N'''', N'''''') + N'''';
  declare @ma_vytvoreno bit = iif(col_length(@t, N'vytvoreno_at') is null, 0, 1);
  declare @ma_zmeneno   bit = iif(col_length(@t, N'zmeneno_at')   is null, 0, 1);

  -- Spojení podle primárního klíče; {a} a {b} se nahradí aliasy.
  declare @spoj nvarchar(max) = stuff((
    select N' and {a}.' + quotename(c.name) + N' = {b}.' + quotename(c.name)
    from sys.indexes ix
    join sys.index_columns ic on ic.object_id = ix.object_id and ic.index_id = ix.index_id
    join sys.columns c on c.object_id = ic.object_id and c.column_id = ic.column_id
    where ix.object_id = @obj and ix.is_primary_key = 1
    order by ic.key_ordinal
    for xml path(''), type).value(N'.', N'nvarchar(max)'), 1, 5, N'');
  if @spoj is null
    throw 50300, N'vytvor_auditni_trigger: tabulka nemá primární klíč.', 1;

  declare @klic sysname =
    case when col_length(@t, N'id') is not null then N'id'
         when col_length(@t, N'uzivatel_id') is not null then N'uzivatel_id'
         when col_length(@t, N'zarizeni_id') is not null then N'zarizeni_id' end;
  declare @zaznam nvarchar(400) =
    iif(@klic is null, N'N''''', N'lower(convert(nvarchar(100), {x}.' + quotename(@klic) + N'))');

  -- Sloupce do JSON. {x} = alias řádku, {vytvoreno} / {zmeneno} = hodnota
  -- razítka (u nového stavu ta, kterou razítko právě zapsalo).
  declare @sloupce nvarchar(max) = stuff((
    select N', ' +
      case
        when c.name = N'zmeneno_at'   then N'convert(nvarchar(30), {zmeneno}, 126) + N''Z'''
        when c.name = N'vytvoreno_at' then N'convert(nvarchar(30), {vytvoreno}, 126) + N''Z'''
        when ty.name = N'uniqueidentifier'
          then N'lower(convert(nchar(36), {x}.' + quotename(c.name) + N'))'
        when ty.name in (N'datetime2', N'datetime', N'smalldatetime')
          then N'convert(nvarchar(30), {x}.' + quotename(c.name) + N', 126) + N''Z'''
        when exists (
          select 1 from sys.check_constraints cc
          where cc.parent_object_id = c.object_id
            and charindex(N'isjson(' + quotename(c.name) + N')', cc.[definition]) > 0
        ) then N'json_query({x}.' + quotename(c.name) + N')'
        else N'{x}.' + quotename(c.name)
      end + N' as ' + quotename(c.name)
    from sys.columns c
    join sys.types ty on ty.user_type_id = c.user_type_id
    where c.object_id = @obj
    order by c.column_id
    for xml path(''), type).value(N'.', N'nvarchar(max)'), 1, 2, N'');
  declare @json nvarchar(max) =
    N'(select ' + @sloupce + N' for json path, include_null_values, without_array_wrapper)';

  declare @json_stary nvarchar(max) =
    replace(replace(replace(@json, N'{x}', N'd'), N'{vytvoreno}', N'd.[vytvoreno_at]'), N'{zmeneno}', N'd.[zmeneno_at]');
  declare @json_novy_insert nvarchar(max) =
    replace(replace(replace(@json, N'{x}', N'i'), N'{vytvoreno}', N'@ted'), N'{zmeneno}', N'@ted');
  declare @json_novy_update nvarchar(max) =
    replace(replace(replace(@json, N'{x}', N'i'), N'{vytvoreno}', N'd.[vytvoreno_at]'), N'{zmeneno}', N'@ted');

  -- Razítka.
  declare @razitko nvarchar(max) = N'';
  if @ma_vytvoreno = 1 or @ma_zmeneno = 1
  begin
    set @razitko = N'
  if @operace = N''INSERT''
    update t set ' +
      concat(iif(@ma_vytvoreno = 1, N'vytvoreno_at = @ted', N''),
             iif(@ma_vytvoreno = 1 and @ma_zmeneno = 1, N', ', N''),
             iif(@ma_zmeneno = 1, N'zmeneno_at = @ted', N'')) + N'
    from ' + @t + N' t join inserted i on ' + replace(replace(@spoj, N'{a}', N't'), N'{b}', N'i') + N';
  if @operace = N''UPDATE''' + iif(@ma_zmeneno = 1, N'', N' and update(vytvoreno_at)') + N'
    update t set ' +
      concat(iif(@ma_vytvoreno = 1, N'vytvoreno_at = d.vytvoreno_at', N''),
             iif(@ma_vytvoreno = 1 and @ma_zmeneno = 1, N', ', N''),
             iif(@ma_zmeneno = 1, N'zmeneno_at = @ted', N'')) + N'
    from ' + @t + N' t join deleted d on ' + replace(replace(@spoj, N'{a}', N't'), N'{b}', N'd') + N';';
  end;

  declare @sql nvarchar(max) = N'create or alter trigger ' + @trigger + N'
on ' + @t + N'
after insert, update, delete
as
begin
  -- Vygenerováno procedurou dbo.vytvor_auditni_trigger (0003). Neupravovat ručně.
  set nocount on;
  if trigger_nestlevel(@@procid) > 1 return;

  declare @operace nvarchar(10) = case
    when exists (select 1 from inserted) and exists (select 1 from deleted) then N''UPDATE''
    when exists (select 1 from inserted) then N''INSERT''
    when exists (select 1 from deleted)  then N''DELETE''
  end;
  if @operace is null return;

  declare @ted datetime2(3) = sysutcdatetime();
  declare @kdo uniqueidentifier = dbo.aktualni_uzivatel();
' + @razitko + N'

  if @operace = N''INSERT''
    insert into dbo.audit_log (tabulka, zaznam_id, operace, stary_stav, novy_stav, uzivatel_id)
    select ' + @literal + N', ' + replace(@zaznam, N'{x}', N'i') + N', @operace, null, '
      + @json_novy_insert + N', @kdo
    from inserted i;
  else if @operace = N''UPDATE''
    insert into dbo.audit_log (tabulka, zaznam_id, operace, stary_stav, novy_stav, uzivatel_id)
    select ' + @literal + N', ' + replace(@zaznam, N'{x}', N'i') + N', @operace, '
      + @json_stary + N', ' + @json_novy_update + N', @kdo
    from inserted i join deleted d on ' + replace(replace(@spoj, N'{a}', N'i'), N'{b}', N'd') + N';
  else
    insert into dbo.audit_log (tabulka, zaznam_id, operace, stary_stav, novy_stav, uzivatel_id)
    select ' + @literal + N', ' + replace(@zaznam, N'{x}', N'd') + N', @operace, '
      + @json_stary + N', null, @kdo
    from deleted d;
end;';

  exec sys.sp_executesql @sql;

  declare @plne nvarchar(300) = N'dbo.' + @nazev;
  exec sys.sp_settriggerorder @triggername = @plne, @order = N'Last', @stmttype = N'INSERT';
  exec sys.sp_settriggerorder @triggername = @plne, @order = N'Last', @stmttype = N'UPDATE';
  exec sys.sp_settriggerorder @triggername = @plne, @order = N'Last', @stmttype = N'DELETE';
end;
GO

-- -----------------------------------------------------------------------------
-- Parametry zařízení (dřív 0003 a 0005)
--
-- Nic navíc: parametr, který schéma typu nezná, je překlep nebo pozůstatek po
-- změně typu. Hodnota musí odpovídat typu. Povinný parametr nesmí chybět -
-- s výjimkou úklidu po změně schématu (typ_zarizeni_uklid_parametru): ten smí
-- uložit i stroj, kterému nově povinný údaj chybí; doplní se při první úpravě.
-- Místo příznaku v relaci (app.uklid_parametru) se úklid pozná podle toho, že
-- jeho trigger je na zásobníku.
--
-- Klíče se párují přes OPENJSON a binární kolaci: SQL Server 2016 nebere
-- proměnnou jako cestu v JSON_VALUE.
-- -----------------------------------------------------------------------------

create trigger dbo.zarizeni_kontrola_parametru
on dbo.zarizeni
after insert, update
as
begin
  set nocount on;
  if trigger_nestlevel(object_id(N'dbo.zarizeni_zmena')) > 0 return;
  if exists (select 1 from deleted) and not (update(parametry) or update(typ_zarizeni_id)) return;

  declare @zprava nvarchar(2048);

  -- 1. Parametr, který schéma nezná.
  select top (1) @zprava = N'Parametr "' + p.[key] + N'" není v schématu typu zařízení.'
  from inserted i
  join dbo.typ_zarizeni t on t.id = i.typ_zarizeni_id
  cross apply openjson(i.parametry) p
  where not exists (
    select 1 from openjson(t.schema_parametru) s
    where s.[key] collate Latin1_General_BIN2 = p.[key] collate Latin1_General_BIN2
  );
  if @zprava is not null throw 50101, @zprava, 1;

  -- 2. Hodnota neodpovídá typu (null je vždy v pořádku).
  select top (1) @zprava = N'Parametr "' + isnull(json_value(s.[value], N'$.popisek'), p.[key]) + N'" '
    + case json_value(s.[value], N'$.typ')
        when N'cislo'  then N'musí být číslo.'
        when N'text'   then N'musí být text.'
        when N'ano_ne' then N'musí být ano/ne.'
        else N'má hodnotu mimo povolený seznam.'
      end
  from inserted i
  join dbo.typ_zarizeni t on t.id = i.typ_zarizeni_id
  cross apply openjson(i.parametry) p
  join openjson(t.schema_parametru) s
    on s.[key] collate Latin1_General_BIN2 = p.[key] collate Latin1_General_BIN2
  where p.[type] <> 0
    and (   (json_value(s.[value], N'$.typ') = N'cislo'  and p.[type] <> 2)
         or (json_value(s.[value], N'$.typ') = N'text'   and p.[type] <> 1)
         or (json_value(s.[value], N'$.typ') = N'ano_ne' and p.[type] <> 3)
         or (json_value(s.[value], N'$.typ') = N'vyber'
             and (p.[type] <> 1
                  or not exists (
                    select 1 from openjson(json_query(s.[value], N'$.moznosti')) m
                    where m.[type] = 1
                      and m.[value] collate Latin1_General_BIN2 = p.[value] collate Latin1_General_BIN2))));
  if @zprava is not null throw 50102, @zprava, 1;

  -- 3. Povinný parametr chybí, je null nebo prázdný text.
  if trigger_nestlevel(object_id(N'dbo.typ_zarizeni_uklid_parametru')) = 0
  begin
    select top (1) @zprava = N'Parametr "' + isnull(json_value(s.[value], N'$.popisek'), s.[key]) + N'" je povinný.'
    from inserted i
    join dbo.typ_zarizeni t on t.id = i.typ_zarizeni_id
    cross apply openjson(t.schema_parametru) s
    where json_value(s.[value], N'$.povinne') = N'true'
      and not exists (
        select 1 from openjson(i.parametry) p
        where p.[key] collate Latin1_General_BIN2 = s.[key] collate Latin1_General_BIN2
          and p.[type] <> 0
          and not (p.[type] = 1 and len(ltrim(rtrim(p.[value]))) = 0)
      );
    if @zprava is not null throw 50103, @zprava, 1;
  end;
end;
GO

-- Úklid hodnot po odebrání parametru ze schématu (dřív 0005). Jen u strojů,
-- které osiřelou hodnotu opravdu mají - jinak by každá úprava typu přepisovala
-- evidenci a zaplavila audit. Objekt se skládá přes FOR XML: JSON_MODIFY
-- v SQL Serveru 2016 nebere proměnnou jako cestu a STRING_AGG tam není.
create trigger dbo.typ_zarizeni_uklid_parametru
on dbo.typ_zarizeni
after update
as
begin
  set nocount on;
  if trigger_nestlevel(object_id(N'dbo.typ_zarizeni_zmena')) > 0 return;
  if not update(schema_parametru) return;

  update z
  set parametry = N'{' + isnull(stuff((
        select N',"' + string_escape(p.[key], 'json') + N'":'
             + case p.[type]
                 when 0 then N'null'
                 when 1 then N'"' + string_escape(p.[value], 'json') + N'"'
                 else p.[value]
               end
        from openjson(z.parametry) p
        where exists (
          select 1 from openjson(i.schema_parametru) s
          where s.[key] collate Latin1_General_BIN2 = p.[key] collate Latin1_General_BIN2)
        for xml path(''), type).value(N'.', N'nvarchar(max)'), 1, 1, N''), N'') + N'}'
  from dbo.zarizeni z
  join inserted i on i.id = z.typ_zarizeni_id
  join deleted d on d.id = i.id
  where i.schema_parametru collate Latin1_General_BIN2 <> d.schema_parametru collate Latin1_General_BIN2
    and exists (
      select 1 from openjson(z.parametry) p
      where not exists (
        select 1 from openjson(i.schema_parametru) s
        where s.[key] collate Latin1_General_BIN2 = p.[key] collate Latin1_General_BIN2));
end;
GO

-- -----------------------------------------------------------------------------
-- Neměnnost aktivované verze šablony (dřív 0006, rozhodnutí R3)
-- -----------------------------------------------------------------------------

create trigger dbo.sablona_verze_zamek
on dbo.sablona_verze
after update, delete
as
begin
  set nocount on;
  if trigger_nestlevel(object_id(N'dbo.sablona_verze_zmena')) > 0 return;
  declare @zprava nvarchar(2048);

  -- Aktivovaná verze se nemaže ani po archivaci: odkazují se na ni hotové
  -- zakázky a s ní by zmizel doklad o tom, co se kdy dělalo.
  if not exists (select 1 from inserted)
  begin
    select top (1) @zprava = N'Verzi ' + cast(d.cislo_verze as nvarchar(10))
      + N', která už byla aktivovaná, nelze smazat.'
    from deleted d where d.stav <> N'navrh';
    if @zprava is not null throw 50111, @zprava, 1;
    return;
  end;

  -- Návrh se měnit smí, včetně aktivace. Z aktivované verze jen archivace při
  -- nástupu nové, beze změny čehokoli dalšího.
  select top (1) @zprava = N'Aktivovaná verze ' + cast(d.cislo_verze as nvarchar(10))
    + N' je neměnná. Založte nový návrh.'
  from deleted d
  join inserted i on i.id = d.id
  where d.stav <> N'navrh'
    and not (
          d.stav = N'aktivni'
      and i.stav = N'archivovana'
      and i.sablona_id = d.sablona_id
      and i.cislo_verze = d.cislo_verze
      and (i.platna_od = d.platna_od or (i.platna_od is null and d.platna_od is null))
      and (i.poznamka_ke_zmene = d.poznamka_ke_zmene or (i.poznamka_ke_zmene is null and d.poznamka_ke_zmene is null))
    );
  if @zprava is not null throw 50112, @zprava, 1;
end;
GO

-- Úkony se mění jen v návrhu. Když verze už neexistuje, maže se celý návrh
-- a tohle je jeho kaskáda - bránit by znemožnilo rozdělaný návrh zahodit.
create trigger dbo.sablona_ukon_zamek
on dbo.sablona_ukon
after insert, update, delete
as
begin
  set nocount on;
  if trigger_nestlevel(object_id(N'dbo.sablona_ukon_zmena')) > 0 return;
  if exists (
    select 1
    from (select sablona_verze_id from inserted union all select sablona_verze_id from deleted) x
    join dbo.sablona_verze v on v.id = x.sablona_verze_id
    where v.stav <> N'navrh'
  )
    throw 50113, N'Matici lze měnit jen v návrhu verze. Založte nový návrh šablony.', 1;
end;
GO

-- -----------------------------------------------------------------------------
-- Uzavřená zakázka je neměnná (dřív 0011)
--
-- Historie, kterou lze zpětně přepsat, je stejně bezcenná jako smazaná.
-- Uzavřená = dokončená nebo zrušená.
-- -----------------------------------------------------------------------------

create trigger dbo.zakazka_zamek
on dbo.zakazka
after update, delete
as
begin
  set nocount on;
  if trigger_nestlevel(object_id(N'dbo.zakazka_zmena')) > 0 return;

  if not exists (select 1 from inserted)
    throw 50121, N'Zakázky se nemažou - historie údržby musí zůstat úplná.', 1;

  -- Otevřená zakázka se měnit smí, včetně uzavření.
  declare @zprava nvarchar(2048);
  select top (1) @zprava = N'Zakázka je uzavřená (' + d.stav + N') a nelze ji měnit.'
  from deleted d where d.stav not in (N'naplanovano', N'probiha');
  if @zprava is not null throw 50122, @zprava, 1;
end;
GO

create trigger dbo.zakazka_ukon_zamek
on dbo.zakazka_ukon
after insert, update, delete
as
begin
  set nocount on;
  if trigger_nestlevel(object_id(N'dbo.zakazka_ukon_zmena')) > 0 return;
  declare @zprava nvarchar(2048);

  select top (1) @zprava = N'Zakázka je uzavřená (' + z.stav + N'), její checklist už nelze měnit.'
  from (select zakazka_id from inserted union all select zakazka_id from deleted) x
  join dbo.zakazka z on z.id = x.zakazka_id
  where z.stav not in (N'naplanovano', N'probiha');
  if @zprava is not null throw 50123, @zprava, 1;

  -- Kontrolní body nesou zadání i odpověď v jednom sloupci: technik smí
  -- přepsat odpovědi, ne otázky.
  if exists (
    select 1
    from inserted i
    join deleted d on d.id = i.id
    where dbo.zadani_kontrolnich_bodu(i.kontrolni_body) <> dbo.zadani_kontrolnich_bodu(d.kontrolni_body)
  )
    throw 50124, N'Zadání kontrolních bodů je součástí matice a při vyplňování se nemění.', 1;
end;
GO

create trigger dbo.zakazka_foto_zamek
on dbo.zakazka_foto
after insert, update, delete
as
begin
  set nocount on;
  if trigger_nestlevel(object_id(N'dbo.zakazka_foto_zmena')) > 0 return;
  declare @zprava nvarchar(2048);

  select top (1) @zprava = N'Zakázka je uzavřená (' + z.stav + N'), fotodokumentaci už nelze měnit.'
  from (select zakazka_ukon_id from inserted union all select zakazka_ukon_id from deleted) x
  join dbo.zakazka_ukon u on u.id = x.zakazka_ukon_id
  join dbo.zakazka z on z.id = u.zakazka_id
  where z.stav not in (N'naplanovano', N'probiha');
  if @zprava is not null throw 50125, @zprava, 1;
end;
GO

-- -----------------------------------------------------------------------------
-- Provozní deník (dřív 0020 a 0022)
-- -----------------------------------------------------------------------------

-- Zpětný zápis je běžný provoz, datum v budoucnosti je vždycky překlep. Den
-- tolerance kryje posun hodin a časových pásem, rok už ne.
create trigger dbo.provozni_denik_cas
on dbo.provozni_denik
after insert, update
as
begin
  set nocount on;
  if trigger_nestlevel(object_id(N'dbo.provozni_denik_zmena')) > 0 return;

  declare @zprava nvarchar(2048);
  select top (1) @zprava = N'Zásah se zapisuje zpětně, ne dopředu. Datum '
    + format(i.provedeno_at at time zone 'UTC' at time zone 'Central Europe Standard Time', N'dd.MM.yyyy HH:mm')
    + N' je v budoucnosti.'
  from inserted i
  where i.provedeno_at > dateadd(day, 1, sysutcdatetime());
  if @zprava is not null throw 50132, @zprava, 1;
end;
GO

-- Oprava zápisu: rozhoduje smi_menit_zapis_deniku (0002) nad STARÝMI hodnotami.
-- Vlastní podmínky tady už jen hledají srozumitelnou větu.
create trigger dbo.provozni_denik_zamek
on dbo.provozni_denik
after update, delete
as
begin
  set nocount on;
  if trigger_nestlevel(object_id(N'dbo.provozni_denik_zmena')) > 0 return;

  if not exists (select 1 from inserted)
    throw 50131, N'Zápis v provozním deníku se nemaže - historie zařízení musí zůstat úplná.', 1;

  declare @kdo uniqueidentifier = dbo.aktualni_uzivatel();
  declare @cizi bit;
  select top (1) @cizi = iif(@kdo is not null and d.zapsal_id = @kdo, 0, 1)
  from deleted d
  where dbo.smi_menit_zapis_deniku(d.oblast_id, d.zapsal_id, d.vytvoreno_at) = 0;

  if @cizi = 1
    throw 50001, N'Cizí zápis v deníku opravit nelze. Požádejte vedoucího údržby.', 1;
  if @cizi = 0
    throw 50002, N'Zápis je starší než 24 hodin, opravit ho už může jen vedoucí údržby.', 1;
end;
GO

-- Fotky k zápisu podléhají stejnému oknu. Zápis, který neexistuje, sem vede
-- leda kaskáda - a tam bránit nemá smysl (zápis se stejně mazat nedá).
create trigger dbo.denik_foto_zamek
on dbo.denik_foto
after insert, update, delete
as
begin
  set nocount on;
  if trigger_nestlevel(object_id(N'dbo.denik_foto_zmena')) > 0 return;

  declare @kdo uniqueidentifier = dbo.aktualni_uzivatel();
  declare @cizi bit;
  select top (1) @cizi = iif(@kdo is not null and z.zapsal_id = @kdo, 0, 1)
  from (select zaznam_id from inserted union all select zaznam_id from deleted) x
  join dbo.provozni_denik z on z.id = x.zaznam_id
  where dbo.smi_menit_zapis_deniku(z.oblast_id, z.zapsal_id, z.vytvoreno_at) = 0;

  if @cizi = 1
    throw 50003, N'K cizímu zápisu v deníku fotky přidávat ani mazat nelze.', 1;
  if @cizi = 0
    throw 50004, N'Zápis je starší než 24 hodin, fotodokumentaci už mění jen vedoucí údržby.', 1;
end;
GO

-- -----------------------------------------------------------------------------
-- Plán drží krok s maticí (dřív 0010)
-- -----------------------------------------------------------------------------

create trigger dbo.zarizeni_sablona_plan
on dbo.zarizeni_sablona
after insert
as
begin
  set nocount on;
  declare @zarizeni uniqueidentifier, @sablona uniqueidentifier;
  declare prirazeni cursor local fast_forward for
    select zarizeni_id, sablona_id from inserted;
  open prirazeni;
  fetch next from prirazeni into @zarizeni, @sablona;
  while @@fetch_status = 0
  begin
    exec dbo.srovnej_plan @zarizeni = @zarizeni, @sablona = @sablona;
    fetch next from prirazeni into @zarizeni, @sablona;
  end;
  close prirazeni;
  deallocate prirazeni;
end;
GO

-- Aktivace verze se týká všech strojů, které šablonu mají - proto se změna
-- matice „automaticky projeví u všech" (zadání ř. 108). AFTER: srovnej_plan
-- čte aktivní verzi z tabulky, nový stav už tam musí být.
create trigger dbo.sablona_verze_plan
on dbo.sablona_verze
after update
as
begin
  set nocount on;
  if trigger_nestlevel(object_id(N'dbo.sablona_verze_zmena')) > 0 return;
  if not update(stav) return;

  declare @zarizeni uniqueidentifier, @sablona uniqueidentifier;
  declare prirazeni cursor local fast_forward for
    select zs.zarizeni_id, zs.sablona_id
    from inserted i
    join deleted d on d.id = i.id
    join dbo.zarizeni_sablona zs on zs.sablona_id = i.sablona_id
    where i.stav = N'aktivni' and d.stav <> N'aktivni';
  open prirazeni;
  fetch next from prirazeni into @zarizeni, @sablona;
  while @@fetch_status = 0
  begin
    exec dbo.srovnej_plan @zarizeni = @zarizeni, @sablona = @sablona;
    fetch next from prirazeni into @zarizeni, @sablona;
  end;
  close prirazeni;
  deallocate prirazeni;
end;
GO

-- -----------------------------------------------------------------------------
-- Pořadí: zámky první, razítka a audit poslední (generátor níž)
-- -----------------------------------------------------------------------------

exec sys.sp_settriggerorder @triggername = N'dbo.sablona_verze_zamek', @order = N'First', @stmttype = N'UPDATE';
exec sys.sp_settriggerorder @triggername = N'dbo.sablona_verze_zamek', @order = N'First', @stmttype = N'DELETE';
exec sys.sp_settriggerorder @triggername = N'dbo.sablona_ukon_zamek',  @order = N'First', @stmttype = N'INSERT';
exec sys.sp_settriggerorder @triggername = N'dbo.sablona_ukon_zamek',  @order = N'First', @stmttype = N'UPDATE';
exec sys.sp_settriggerorder @triggername = N'dbo.sablona_ukon_zamek',  @order = N'First', @stmttype = N'DELETE';
exec sys.sp_settriggerorder @triggername = N'dbo.zakazka_zamek',       @order = N'First', @stmttype = N'UPDATE';
exec sys.sp_settriggerorder @triggername = N'dbo.zakazka_zamek',       @order = N'First', @stmttype = N'DELETE';
exec sys.sp_settriggerorder @triggername = N'dbo.zakazka_ukon_zamek',  @order = N'First', @stmttype = N'INSERT';
exec sys.sp_settriggerorder @triggername = N'dbo.zakazka_ukon_zamek',  @order = N'First', @stmttype = N'UPDATE';
exec sys.sp_settriggerorder @triggername = N'dbo.zakazka_ukon_zamek',  @order = N'First', @stmttype = N'DELETE';
exec sys.sp_settriggerorder @triggername = N'dbo.zakazka_foto_zamek',  @order = N'First', @stmttype = N'INSERT';
exec sys.sp_settriggerorder @triggername = N'dbo.zakazka_foto_zamek',  @order = N'First', @stmttype = N'UPDATE';
exec sys.sp_settriggerorder @triggername = N'dbo.zakazka_foto_zamek',  @order = N'First', @stmttype = N'DELETE';
exec sys.sp_settriggerorder @triggername = N'dbo.provozni_denik_zamek', @order = N'First', @stmttype = N'UPDATE';
exec sys.sp_settriggerorder @triggername = N'dbo.provozni_denik_zamek', @order = N'First', @stmttype = N'DELETE';
exec sys.sp_settriggerorder @triggername = N'dbo.provozni_denik_cas',   @order = N'First', @stmttype = N'INSERT';
exec sys.sp_settriggerorder @triggername = N'dbo.denik_foto_zamek',    @order = N'First', @stmttype = N'INSERT';
exec sys.sp_settriggerorder @triggername = N'dbo.denik_foto_zamek',    @order = N'First', @stmttype = N'UPDATE';
exec sys.sp_settriggerorder @triggername = N'dbo.denik_foto_zamek',    @order = N'First', @stmttype = N'DELETE';
exec sys.sp_settriggerorder @triggername = N'dbo.zarizeni_kontrola_parametru', @order = N'First', @stmttype = N'INSERT';
exec sys.sp_settriggerorder @triggername = N'dbo.zarizeni_kontrola_parametru', @order = N'First', @stmttype = N'UPDATE';
GO

-- -----------------------------------------------------------------------------
-- Razítka a audit nad 20 tabulkami (dřív audit_zmeny + nastav_zmeneno_at).
-- Bez triggeru jsou tablet (zápis „naposledy viděn" by zahltil audit), pin
-- a pokus_hesla (hash a počítadla do auditu nepatří) - jejich události
-- zapisují do audit_log procedury z 0004 samy.
-- -----------------------------------------------------------------------------

exec dbo.vytvor_auditni_trigger N'oblast';
exec dbo.vytvor_auditni_trigger N'role';
exec dbo.vytvor_auditni_trigger N'umisteni';
exec dbo.vytvor_auditni_trigger N'profil';
exec dbo.vytvor_auditni_trigger N'uzivatel_role';
exec dbo.vytvor_auditni_trigger N'uzivatel_oblast';
exec dbo.vytvor_auditni_trigger N'typ_zarizeni';
exec dbo.vytvor_auditni_trigger N'zarizeni';
exec dbo.vytvor_auditni_trigger N'zarizeni_soubor';
exec dbo.vytvor_auditni_trigger N'sablona';
exec dbo.vytvor_auditni_trigger N'sablona_verze';
exec dbo.vytvor_auditni_trigger N'sablona_ukon';
exec dbo.vytvor_auditni_trigger N'zarizeni_sablona';
exec dbo.vytvor_auditni_trigger N'plan_udrzby';
exec dbo.vytvor_auditni_trigger N'zakazka';
exec dbo.vytvor_auditni_trigger N'zakazka_ukon';
exec dbo.vytvor_auditni_trigger N'zakazka_foto';
exec dbo.vytvor_auditni_trigger N'druh_zasahu';
exec dbo.vytvor_auditni_trigger N'provozni_denik';
exec dbo.vytvor_auditni_trigger N'denik_foto';
GO
