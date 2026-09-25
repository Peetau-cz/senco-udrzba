-- =============================================================================
-- 0004: procedury (docs/NASAZENI.md, kolo R2)
--
-- Přepis funkcí volaných z aplikace a z plánovače (větev `supabase`):
-- zaloz_navrh_verze a srovnej_plan z 0010, aktivuj_verzi z 0006, zaloz_zakazky
-- z 0017, naplanuj_zarizeni z 0015, dokonci_zakazku z 0013. Nové: přihlášení
-- heslem (osoba_pro_prihlaseni, nacti_prihlaseni, nastav_heslo, zámek hesla),
-- tablet a PIN pro dílnu (25. 9. 2026) a spust_planovac (náhrada pg_cron, R7).
-- Karty a osoba_podle_karty / _osobniho_cisla z 0024 zanikly s kioskem.
--
-- SECURITY DEFINER -> WITH EXECUTE AS OWNER. Procedura pak běží jako dbo:
-- řádková omezení ji pustí (výjimka pro db_owner, R3) a SESSION_CONTEXT
-- s přihlášenou osobou zůstává, takže aktualni_uzivatel() i pomocné funkce
-- oprávnění fungují dál. Každá taková procedura si oprávnění ověří sama hned
-- na začátku - obcházet RLS bez kontroly by z ní udělalo díru.
-- Bez EXECUTE AS (jako INVOKER v PostgreSQL) zůstávají zaloz_navrh_verze
-- a aktivuj_verzi: tam má rozhodnout RLS nad šablonami.
--
-- Návratová hodnota PostgreSQL -> jednořádkový výsledek (`select … as id`).
-- zaloz_zakazky vrací počet výstupním parametrem, aby ji mohly volat jiné
-- procedury bez druhé sady výsledků.
--
-- Čísla chyb (řady viz src/lib/db/chyby.ts):
--   50011 dokončit údržbu v oblasti     50141 zakázka už je uzavřená
--   50012 plánovat údržbu v oblasti     50142 nevyřízené kroky checklistu
--   50013 nastavit heslo                50143 chybí povinná fotografie
--   50014 spravovat PIN                 50151 aktivovat lze jen návrh
--   50015 registrovat / zrušit tablet   50152 verze bez úkonu
--   50016 změnit PIN bez přihlášení     50309 role nejsou platný JSON
--   50017 přidělovat role               50310 oblasti nejsou platný JSON
--   50018 přidělovat oblasti
--   50021 tablet není registrovaný      50301 plánovací okno záporné
--                                       50302 výpočet termínu se nesbíhá
--   50201 zakázka neexistuje            50303 prázdný hash hesla
--   50202 verze šablony neexistuje      50304 PIN není 4-6 číslic
--   50203 zařízení neexistuje           50305 slabý PIN
--   50204 osoba neexistuje              50306 nový PIN = starý
--   50205 tablet neexistuje             50307 chybí token tabletu
--   50206 osoba nemá PIN                50308 tablet bez názvu
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Šablony: návrh a aktivace verze (dřív 0010 a 0006)
-- -----------------------------------------------------------------------------

-- Založí návrh nové verze a zkopíruje do něj matici z platné verze včetně
-- stálých klíčů úkonů. Existující návrh vrátí beze změny. Kdo přidá sloupec
-- do sablona_ukon, musí ho doplnit i sem (poučení z nabizi_poznamku, 0010).
create procedure dbo.zaloz_navrh_verze
  @sablona_id uniqueidentifier
as
begin
  set nocount on;
  set xact_abort on;

  declare @navrh uniqueidentifier =
    (select id from dbo.sablona_verze where sablona_id = @sablona_id and stav = N'navrh');
  if @navrh is not null
  begin
    select @navrh as id;
    return;
  end;

  begin tran;
    declare @cislo int = (select isnull(max(cislo_verze), 0) + 1 from dbo.sablona_verze where sablona_id = @sablona_id);
    set @navrh = newid();
    insert into dbo.sablona_verze (id, sablona_id, cislo_verze, vytvoril_id)
    values (@navrh, @sablona_id, @cislo, dbo.aktualni_uzivatel());

    -- Nový návrh vychází z toho, co právě platí; úplně první verze je prázdná.
    insert into dbo.sablona_ukon (
      sablona_verze_id, klic, poradi, nazev, popis, interval_typ, interval_hodnota,
      interval_zaklad, tolerance_dny, profese_role_id, kontrolni_body,
      vyzaduje_foto, vyzaduje_hodnotu, nabizi_poznamku, jednotka, mez_min, mez_max
    )
    select
      @navrh, u.klic, u.poradi, u.nazev, u.popis, u.interval_typ, u.interval_hodnota,
      u.interval_zaklad, u.tolerance_dny, u.profese_role_id, u.kontrolni_body,
      u.vyzaduje_foto, u.vyzaduje_hodnotu, u.nabizi_poznamku, u.jednotka, u.mez_min, u.mez_max
    from dbo.sablona_ukon u
    join dbo.sablona_verze v on v.id = u.sablona_verze_id
    where v.sablona_id = @sablona_id and v.stav = N'aktivni';
  commit;

  select @navrh as id;
end;
GO

-- Aktivuje návrh a archivuje dosavadní platnou verzi - jedna transakce, ať
-- šablona nezůstane bez verze. Plán srovná trigger sablona_verze_plan (0003).
create procedure dbo.aktivuj_verzi
  @verze_id uniqueidentifier
as
begin
  set nocount on;
  set xact_abort on;

  declare @sablona uniqueidentifier, @stav nvarchar(30), @zprava nvarchar(2048);
  select @sablona = sablona_id, @stav = stav from dbo.sablona_verze where id = @verze_id;

  if @sablona is null
    throw 50202, N'Verze šablony neexistuje.', 1;
  if @stav <> N'navrh'
  begin
    set @zprava = N'Aktivovat lze jen návrh; tahle verze je ' + @stav + N'.';
    throw 50151, @zprava, 1;
  end;
  -- Prázdná matice se nedá naplánovat a v plnění by vyšla na sto procent.
  if not exists (select 1 from dbo.sablona_ukon where sablona_verze_id = @verze_id)
    throw 50152, N'Verze bez jediného úkonu nemá co plánovat. Doplňte matici.', 1;

  begin tran;
    update dbo.sablona_verze set stav = N'archivovana'
    where sablona_id = @sablona and stav = N'aktivni';

    update dbo.sablona_verze set stav = N'aktivni', platna_od = sysutcdatetime()
    where id = @verze_id;
  commit;
end;
GO

-- -----------------------------------------------------------------------------
-- Plán údržby (dřív 0010)
--
-- Doplní plán o nové linie úkonů platné matice a vyřadí ty, které z ní
-- zmizely. Idempotentní; termíny, které zadal garant, nikdy nepřepisuje.
-- EXECUTE AS OWNER: volá se z triggerů nad přiřazením a verzemi, kde právo
-- už bylo ověřené tím, že uživatel směl provést tu původní změnu.
-- -----------------------------------------------------------------------------

create procedure dbo.srovnej_plan
  @zarizeni uniqueidentifier,
  @sablona  uniqueidentifier
with execute as owner
as
begin
  set nocount on;

  declare @verze uniqueidentifier =
    (select id from dbo.sablona_verze where sablona_id = @sablona and stav = N'aktivni');
  -- Bez platné verze není podle čeho plánovat; řádky plánu ale nemizí.
  if @verze is null return;

  insert into dbo.plan_udrzby (zarizeni_id, sablona_id, ukon_klic)
  select @zarizeni, @sablona, u.klic
  from dbo.sablona_ukon u
  where u.sablona_verze_id = @verze
    and not exists (
      select 1 from dbo.plan_udrzby p
      where p.zarizeni_id = @zarizeni and p.sablona_id = @sablona and p.ukon_klic = u.klic
    );

  -- Úkon, který v platné verzi není, se přestane plánovat; návrat úkonu
  -- řádek oživí i s tím, kdy se naposled dělal.
  update p
  set aktivni = iif(exists (select 1 from dbo.sablona_ukon u
                            where u.sablona_verze_id = @verze and u.klic = p.ukon_klic), 1, 0)
  from dbo.plan_udrzby p
  where p.zarizeni_id = @zarizeni
    and p.sablona_id = @sablona
    and p.aktivni <> iif(exists (select 1 from dbo.sablona_ukon u
                                 where u.sablona_verze_id = @verze and u.klic = p.ukon_klic), 1, 0);
end;
GO

-- -----------------------------------------------------------------------------
-- Zakládání zakázek (dřív 0017)
--
-- Pro úkony splatné v plánovacím okně založí zakázky: jedna na skupinu stroj
-- + termín + profese + verze matice, do ní kroky s kopií textu úkonu (R3).
-- Idempotentní - úkon, který už má otevřený krok, se přeskočí. Oprávnění se
-- neověřuje: jede napříč oblastmi a volají ji jen naplanuj_zarizeni
-- a spust_planovac (EXECUTE jí aplikace nedostane, R3).
-- Kdo přidá sloupec do matice nebo do checklistu, musí ho doplnit i sem.
-- -----------------------------------------------------------------------------

create procedure dbo.zaloz_zakazky
  @okno_dnu int = 14,
  @zarizeni uniqueidentifier = null,
  @pocet    int = null output
with execute as owner
as
begin
  set nocount on;
  set xact_abort on;

  if @okno_dnu is null or @okno_dnu < 0
    throw 50301, N'Plánovací okno nemůže být záporné.', 1;

  declare @do date = dateadd(day, @okno_dnu, dbo.dnes());

  create table #radky (
    plan_id          uniqueidentifier not null,
    zarizeni_id      uniqueidentifier not null,
    dalsi_termin     date             not null,
    verze_id         uniqueidentifier not null,
    ukon_id          uniqueidentifier not null,
    profese_role_id  uniqueidentifier not null,
    poradi           int              not null,
    nazev            nvarchar(200)    not null,
    popis            nvarchar(max)    null,
    kontrolni_body   nvarchar(max)    not null,
    vyzaduje_foto    bit              not null,
    vyzaduje_hodnotu bit              not null,
    nabizi_poznamku  bit              not null,
    jednotka         nvarchar(30)     null,
    mez_min          decimal(18, 4)   null,
    mez_max          decimal(18, 4)   null,
    tolerance_dny    int              not null
  );

  insert into #radky
  select p.id, p.zarizeni_id, p.dalsi_termin, v.id, u.id, u.profese_role_id, u.poradi,
         u.nazev, u.popis, u.kontrolni_body, u.vyzaduje_foto, u.vyzaduje_hodnotu,
         u.nabizi_poznamku, u.jednotka, u.mez_min, u.mez_max, u.tolerance_dny
  from dbo.plan_udrzby p
  join dbo.sablona_verze v on v.sablona_id = p.sablona_id and v.stav = N'aktivni'
  join dbo.sablona_ukon u on u.sablona_verze_id = v.id and u.klic = p.ukon_klic
  where p.aktivni = 1
    and (@zarizeni is null or p.zarizeni_id = @zarizeni)
    -- Řádek bez termínu čeká na garanta.
    and p.dalsi_termin is not null
    and p.dalsi_termin <= @do
    and not exists (
      select 1
      from dbo.zakazka_ukon zu
      join dbo.zakazka z on z.id = zu.zakazka_id
      where zu.plan_udrzby_id = p.id and z.stav in (N'naplanovano', N'probiha')
    );

  -- Skupiny a jejich zakázky: otevřená se použije, chybějící dostane nové id.
  -- (OUTPUT nad tabulkou s triggerem nejde, id se proto generuje předem.)
  create table #skupiny (
    zarizeni_id     uniqueidentifier not null,
    dalsi_termin    date             not null,
    profese_role_id uniqueidentifier not null,
    verze_id        uniqueidentifier not null,
    zakazka_id      uniqueidentifier not null,
    nova            bit              not null
  );

  insert into #skupiny (zarizeni_id, dalsi_termin, profese_role_id, verze_id, zakazka_id, nova)
  select g.zarizeni_id, g.dalsi_termin, g.profese_role_id, g.verze_id,
         isnull(z.id, newid()), iif(z.id is null, 1, 0)
  from (select distinct zarizeni_id, dalsi_termin, profese_role_id, verze_id from #radky) g
  outer apply (
    select top (1) k.id
    from dbo.zakazka k
    where k.zarizeni_id = g.zarizeni_id
      and k.planovany_termin = g.dalsi_termin
      and k.profese_role_id = g.profese_role_id
      and k.sablona_verze_id = g.verze_id
      and k.stav in (N'naplanovano', N'probiha')
  ) z;

  begin tran;
    insert into dbo.zakazka (id, zarizeni_id, sablona_verze_id, profese_role_id, planovany_termin)
    select zakazka_id, zarizeni_id, verze_id, profese_role_id, dalsi_termin
    from #skupiny where nova = 1;

    insert into dbo.zakazka_ukon (
      zakazka_id, plan_udrzby_id, sablona_ukon_id, poradi,
      nazev_snapshot, popis_snapshot, kontrolni_body,
      vyzaduje_foto, vyzaduje_hodnotu, nabizi_poznamku,
      jednotka_snapshot, mez_min_snapshot, mez_max_snapshot, tolerance_dny_snapshot
    )
    select s.zakazka_id, r.plan_id, r.ukon_id, r.poradi,
           r.nazev, r.popis, r.kontrolni_body,
           r.vyzaduje_foto, r.vyzaduje_hodnotu, r.nabizi_poznamku,
           r.jednotka, r.mez_min, r.mez_max, r.tolerance_dny
    from #radky r
    join #skupiny s
      on s.zarizeni_id = r.zarizeni_id and s.dalsi_termin = r.dalsi_termin
     and s.profese_role_id = r.profese_role_id and s.verze_id = r.verze_id;
    set @pocet = @@rowcount;
  commit;
end;
GO

-- Naplánuje splatné úkony jednoho stroje; volá ji aplikace po uložení termínů.
-- Ptá se stejné funkce jako zápis do plánu - kdo smí zadat termín, smí ho
-- i uvést v život. Vrací počet nových kroků („naplánováno 6 úkonů").
create procedure dbo.naplanuj_zarizeni
  @zarizeni uniqueidentifier
with execute as owner
as
begin
  set nocount on;

  declare @oblast uniqueidentifier = (select oblast_id from dbo.zarizeni where id = @zarizeni);
  if @oblast is null
    throw 50203, N'Zařízení neexistuje.', 1;
  if dbo.spravuje_sablony_v_oblasti(@oblast) = 0
    throw 50012, N'Nemáte oprávnění plánovat údržbu v této oblasti.', 1;

  declare @pocet int;
  exec dbo.zaloz_zakazky @okno_dnu = 14, @zarizeni = @zarizeni, @pocet = @pocet output;
  select @pocet as pocet;
end;
GO

-- -----------------------------------------------------------------------------
-- Dokončení zakázky (dřív 0013)
--
-- Uzavřít zakázku a posunout plán je jedna nedělitelná věc. Interval se čte
-- z PLATNÉ verze, ne ze snímku v zakázce: změna matice se má projevit sama.
-- EXECUTE AS OWNER kvůli zápisu do plan_udrzby, který smí jen garant - dokončit
-- ale má i údržbář. Oprávnění se proto ověřuje hned na začátku.
-- -----------------------------------------------------------------------------

create procedure dbo.dokonci_zakazku
  @zakazka uniqueidentifier
with execute as owner
as
begin
  set nocount on;
  set xact_abort on;

  declare @oblast uniqueidentifier, @stav nvarchar(30), @pocet int, @zprava nvarchar(2048);
  select @oblast = z.oblast_id, @stav = k.stav
  from dbo.zakazka k
  join dbo.zarizeni z on z.id = k.zarizeni_id
  where k.id = @zakazka;

  if @oblast is null
    throw 50201, N'Zakázka neexistuje.', 1;
  if dbo.provadi_udrzbu_v_oblasti(@oblast) = 0
    throw 50011, N'Nemáte oprávnění dokončit údržbu v této oblasti.', 1;
  if @stav not in (N'naplanovano', N'probiha')
  begin
    set @zprava = N'Zakázka už je uzavřená (' + @stav + N').';
    throw 50141, @zprava, 1;
  end;

  -- Nevyřízený krok znamená, že se na něj zapomnělo; kdo ho udělat nemohl,
  -- označí ho jako neproveditelný a napíše proč.
  set @pocet = (select count(*) from dbo.zakazka_ukon where zakazka_id = @zakazka and stav = N'nesplneno');
  if @pocet > 0
  begin
    set @zprava = N'Zbývá ' + cast(@pocet as nvarchar(10)) + N' nevyřízených kroků checklistu.';
    throw 50142, @zprava, 1;
  end;

  -- Povinné foto se hlídá až tady: technik fotí průběžně.
  set @pocet = (
    select count(*)
    from dbo.zakazka_ukon u
    where u.zakazka_id = @zakazka
      and u.vyzaduje_foto = 1
      and u.stav = N'splneno'
      and not exists (select 1 from dbo.zakazka_foto f where f.zakazka_ukon_id = u.id)
  );
  if @pocet > 0
  begin
    set @zprava = N'U ' + cast(@pocet as nvarchar(10)) + N' kroků chybí povinná fotografie.';
    throw 50143, @zprava, 1;
  end;

  -- Posun plánu jen u splněných kroků; neproveditelný krok zůstává splatný.
  declare @dnes date = dbo.dnes();
  create table #posun (plan_id uniqueidentifier not null primary key, termin date null);
  insert into #posun (plan_id, termin)
  select p.id,
         dbo.dalsi_termin(k.planovany_termin, @dnes, s.interval_typ, s.interval_hodnota, s.interval_zaklad)
  from dbo.zakazka_ukon u
  join dbo.zakazka k       on k.id = u.zakazka_id
  join dbo.plan_udrzby p   on p.id = u.plan_udrzby_id
  join dbo.sablona_verze v on v.sablona_id = p.sablona_id and v.stav = N'aktivni'
  join dbo.sablona_ukon s  on s.sablona_verze_id = v.id and s.klic = p.ukon_klic
  where u.zakazka_id = @zakazka and u.stav = N'splneno';

  if exists (select 1 from #posun where termin is null)
    throw 50302, N'Další termín se nepodařilo spočítat - zkontrolujte interval úkonu v šabloně.', 1;

  begin tran;
    update p
    set dalsi_termin = x.termin, posledni_provedeno_at = sysutcdatetime()
    from dbo.plan_udrzby p
    join #posun x on x.plan_id = p.id;

    update dbo.zakazka
    set stav = N'dokonceno', dokonceno_at = sysutcdatetime(), dokoncil_id = dbo.aktualni_uzivatel()
    where id = @zakazka;
  commit;
end;
GO

-- -----------------------------------------------------------------------------
-- Tablet v dílně: registrace a přihlášení PINem (rozhodnuto 25. 9. 2026)
--
-- O přihlášení PINem rozhoduje databáze: tablet, zámek i PIN se ověří
-- uvnitř, ven jde jen výsledek. Aplikace na tabulky tablet a pin nemá právo
-- (R3), k tabulkám pustí procedury řetězení vlastnictví.
--
-- Token tabletu zná jen cookie tabletu; aplikace posílá jeho SHA-256.
--
-- POZOR pro aplikaci (R4, M7): prihlas_pinem a zmen_pin vracejí špatný PIN
-- výsledkem, ne chybou, a počítadlo chyb si zapisují samy. Aplikace je nesmí
-- volat uvnitř transakce, kterou pak vrátí - s ní by se vrátilo i počítadlo
-- a zámek by nešlo nikdy dosáhnout.
-- -----------------------------------------------------------------------------

create procedure dbo.zaregistruj_tablet
  @nazev      nvarchar(100),
  @token_hash binary(32)
as
begin
  set nocount on;
  set xact_abort on;

  if is_member(N'db_owner') = 0 and dbo.ma_roli(N'administrator') = 0
    throw 50015, N'Tablet smí zaregistrovat jen administrátor.', 1;
  if @token_hash is null
    throw 50307, N'Chybí token tabletu.', 1;
  if @nazev is null or len(ltrim(rtrim(@nazev))) = 0
    throw 50308, N'Tablet musí mít název.', 1;

  declare @id uniqueidentifier = newid();
  begin tran;
    insert into dbo.tablet (id, nazev, token_hash, vytvoril_id)
    values (@id, ltrim(rtrim(@nazev)), @token_hash, dbo.aktualni_uzivatel());

    insert into dbo.audit_log (tabulka, zaznam_id, operace, stary_stav, novy_stav, uzivatel_id)
    values (N'tablet', lower(convert(nvarchar(100), @id)), N'INSERT', null,
            (select lower(convert(nchar(36), @id)) as id, ltrim(rtrim(@nazev)) as nazev,
                    cast(1 as bit) as aktivni
             for json path, without_array_wrapper),
            dbo.aktualni_uzivatel());
  commit;

  select @id as id;
end;
GO

create procedure dbo.zrus_tablet
  @id uniqueidentifier
as
begin
  set nocount on;
  set xact_abort on;

  if is_member(N'db_owner') = 0 and dbo.ma_roli(N'administrator') = 0
    throw 50015, N'Tablet smí zrušit jen administrátor.', 1;

  begin tran;
    update dbo.tablet set aktivni = 0, zmeneno_at = sysutcdatetime()
    where id = @id and aktivni = 1;
    if @@rowcount = 0
      throw 50205, N'Takový aktivní tablet neexistuje.', 1;

    insert into dbo.audit_log (tabulka, zaznam_id, operace, stary_stav, novy_stav, uzivatel_id)
    values (N'tablet', lower(convert(nvarchar(100), @id)), N'UPDATE',
            N'{"aktivni":true}', N'{"aktivni":false}', dbo.aktualni_uzivatel());
  commit;
end;
GO

-- Kdo se na tabletu smí přihlásit: aktivní osoby s rolí a nastaveným PINem.
-- Před přihlášením řádková omezení nad profil nikoho nepustí - proto EXECUTE
-- AS OWNER; bez registrovaného tabletu se seznam jmen nevydá.
create procedure dbo.seznam_pro_tablet
  @token_hash binary(32)
with execute as owner
as
begin
  set nocount on;

  declare @tablet uniqueidentifier =
    (select id from dbo.tablet where token_hash = @token_hash and aktivni = 1);
  if @tablet is null
    throw 50021, N'Tablet není registrovaný. Požádejte administrátora.', 1;

  update dbo.tablet set naposledy_at = sysutcdatetime() where id = @tablet;

  select p.id, p.jmeno, p.prijmeni
  from dbo.profil p
  where p.aktivni = 1
    and exists (select 1 from dbo.uzivatel_role ur where ur.uzivatel_id = p.id)
    and exists (select 1 from dbo.pin n where n.profil_id = p.id)
  order by p.prijmeni, p.jmeno;
end;
GO

-- Jádro ověření PINu se zámkem; volají ho jen prihlas_pinem a zmen_pin
-- (aplikace na ně EXECUTE nemá). Vlastní transakce se zámkem řádku, aby dva
-- souběžné pokusy nesečetly chyby špatně.
--   @vysledek: ok | spatny_pin | zamceno | zamceno_trvale | bez_pinu
create procedure dbo.over_pin_osoby
  @osoba      uniqueidentifier,
  @pin        nvarchar(20),
  @vysledek   nvarchar(20) output,
  @zamceno_do datetime2(3) output
as
begin
  set nocount on;
  set xact_abort on;

  declare @sul binary(16), @hash binary(64), @chyb int, @trvale bit, @ted datetime2(3) = sysutcdatetime();
  set @zamceno_do = null;

  begin tran;
    select @sul = sul, @hash = hash, @chyb = chyb, @zamceno_do = zamceno_do, @trvale = zamceno_trvale
    from dbo.pin with (updlock, holdlock)
    where profil_id = @osoba;

    if @sul is null
    begin
      set @vysledek = N'bez_pinu';
      commit;
      return;
    end;
    if @trvale = 1
    begin
      set @vysledek = N'zamceno_trvale';
      commit;
      return;
    end;
    if @zamceno_do > @ted
    begin
      set @vysledek = N'zamceno';
      commit;
      return;
    end;

    -- Nesmyslný vstup (písmena, špatná délka) se počítá jako špatný PIN.
    if dbo.je_platny_pin(@pin) = 1 and dbo.hash_pinu(@sul, @pin) = @hash
    begin
      update dbo.pin set chyb = 0, zamceno_do = null where profil_id = @osoba;
      set @zamceno_do = null;
      set @vysledek = N'ok';
      commit;
      return;
    end;

    set @chyb += 1;
    set @vysledek = N'spatny_pin';
    set @zamceno_do = null;
    if @chyb >= 10
    begin
      update dbo.pin set chyb = @chyb, zamceno_trvale = 1 where profil_id = @osoba;
      set @vysledek = N'zamceno_trvale';
    end
    else if @chyb = 5
    begin
      set @zamceno_do = dateadd(minute, 15, @ted);
      update dbo.pin set chyb = @chyb, zamceno_do = @zamceno_do where profil_id = @osoba;
      set @vysledek = N'zamceno';
    end
    else
      update dbo.pin set chyb = @chyb where profil_id = @osoba;

    if @vysledek <> N'spatny_pin'
      insert into dbo.audit_log (tabulka, zaznam_id, operace, stary_stav, novy_stav, uzivatel_id)
      values (N'pin', lower(convert(nvarchar(100), @osoba)), N'UPDATE', null,
              (select @vysledek as udalost, @chyb as chyb for json path, without_array_wrapper),
              dbo.aktualni_uzivatel());
  commit;
end;
GO

-- Přihlášení PINem na tabletu. Vrací jeden řádek:
--   vysledek (ok | spatny_pin | zamceno | zamceno_trvale | bez_pinu | neznama_osoba),
--   tablet_id, musi_zmenit (jen u ok), zamceno_do (jen u zamceno).
create procedure dbo.prihlas_pinem
  @token_hash binary(32),
  @osoba      uniqueidentifier,
  @pin        nvarchar(20)
with execute as owner
as
begin
  set nocount on;

  declare @tablet uniqueidentifier =
    (select id from dbo.tablet where token_hash = @token_hash and aktivni = 1);
  if @tablet is null
    throw 50021, N'Tablet není registrovaný. Požádejte administrátora.', 1;

  if not exists (
    select 1 from dbo.profil p
    where p.id = @osoba and p.aktivni = 1
      and exists (select 1 from dbo.uzivatel_role ur where ur.uzivatel_id = p.id)
  )
  begin
    select N'neznama_osoba' as vysledek, @tablet as tablet_id,
           cast(null as bit) as musi_zmenit, cast(null as datetime2(3)) as zamceno_do;
    return;
  end;

  declare @vysledek nvarchar(20), @zamceno_do datetime2(3);
  exec dbo.over_pin_osoby @osoba = @osoba, @pin = @pin,
       @vysledek = @vysledek output, @zamceno_do = @zamceno_do output;

  if @vysledek = N'ok'
    update dbo.tablet set naposledy_at = sysutcdatetime() where id = @tablet;

  select @vysledek as vysledek, @tablet as tablet_id,
         iif(@vysledek = N'ok', (select musi_zmenit from dbo.pin where profil_id = @osoba), null) as musi_zmenit,
         @zamceno_do as zamceno_do;
end;
GO

-- Admin nastaví dočasný PIN (i při zapomenutí). Osoba si ho při prvním
-- přihlášení musí změnit; dřívější přihlášení té osoby přestanou platit.
create procedure dbo.nastav_pin
  @osoba uniqueidentifier,
  @pin   nvarchar(20)
as
begin
  set nocount on;
  set xact_abort on;

  if is_member(N'db_owner') = 0 and dbo.ma_roli(N'administrator') = 0
    throw 50014, N'PIN smí nastavit jen administrátor.', 1;
  if dbo.je_platny_pin(@pin) = 0
    throw 50304, N'PIN musí mít 4 až 6 číslic.', 1;
  if dbo.je_slaby_pin(@pin) = 1
    throw 50305, N'PIN je příliš snadný (stejné číslice nebo řada). Zvolte jiný.', 1;
  if not exists (select 1 from dbo.profil where id = @osoba)
    throw 50204, N'Osoba neexistuje.', 1;

  declare @sul binary(16) = crypt_gen_random(16);
  begin tran;
    update dbo.pin
    set sul = @sul, hash = dbo.hash_pinu(@sul, @pin), musi_zmenit = 1, chyb = 0,
        zamceno_do = null, zamceno_trvale = 0, zmeneno_at = sysutcdatetime()
    where profil_id = @osoba;
    if @@rowcount = 0
      insert into dbo.pin (profil_id, sul, hash) values (@osoba, @sul, dbo.hash_pinu(@sul, @pin));

    update dbo.profil set relace_platne_od = sysutcdatetime() where id = @osoba;

    insert into dbo.audit_log (tabulka, zaznam_id, operace, stary_stav, novy_stav, uzivatel_id)
    values (N'pin', lower(convert(nvarchar(100), @osoba)), N'UPDATE', null,
            N'{"udalost":"nastaven_docasny"}', dbo.aktualni_uzivatel());
  commit;
end;
GO

-- Osoba si změní vlastní PIN (vynuceně po dočasném, nebo kdykoli). Nový PIN se
-- kontroluje PŘED ověřením starého: chyba nového je THROW, a ten by s sebou
-- vrátil i zapsané počítadlo chyb starého PINu. Špatný starý PIN se vrací
-- výsledkem (vysledek jako u over_pin_osoby).
create procedure dbo.zmen_pin
  @stary nvarchar(20),
  @novy  nvarchar(20)
with execute as owner
as
begin
  set nocount on;
  set xact_abort on;

  declare @osoba uniqueidentifier = dbo.aktualni_uzivatel();
  if @osoba is null
    throw 50016, N'PIN si může změnit jen přihlášená osoba.', 1;
  if dbo.je_platny_pin(@novy) = 0
    throw 50304, N'PIN musí mít 4 až 6 číslic.', 1;
  if dbo.je_slaby_pin(@novy) = 1
    throw 50305, N'PIN je příliš snadný (stejné číslice nebo řada). Zvolte jiný.', 1;
  if @novy = @stary
    throw 50306, N'Nový PIN musí být jiný než původní.', 1;

  declare @vysledek nvarchar(20), @zamceno_do datetime2(3);
  exec dbo.over_pin_osoby @osoba = @osoba, @pin = @stary,
       @vysledek = @vysledek output, @zamceno_do = @zamceno_do output;

  if @vysledek = N'ok'
  begin
    declare @sul binary(16) = crypt_gen_random(16);
    update dbo.pin
    set sul = @sul, hash = dbo.hash_pinu(@sul, @novy), musi_zmenit = 0, zmeneno_at = sysutcdatetime()
    where profil_id = @osoba;
  end;

  select @vysledek as vysledek, @zamceno_do as zamceno_do;
end;
GO

create procedure dbo.odemkni_pin
  @osoba uniqueidentifier
as
begin
  set nocount on;
  set xact_abort on;

  if is_member(N'db_owner') = 0 and dbo.ma_roli(N'administrator') = 0
    throw 50014, N'PIN smí odemknout jen administrátor.', 1;

  begin tran;
    update dbo.pin set chyb = 0, zamceno_do = null, zamceno_trvale = 0 where profil_id = @osoba;
    if @@rowcount = 0
      throw 50206, N'Osoba nemá nastavený PIN.', 1;

    insert into dbo.audit_log (tabulka, zaznam_id, operace, stary_stav, novy_stav, uzivatel_id)
    values (N'pin', lower(convert(nvarchar(100), @osoba)), N'UPDATE', null,
            N'{"udalost":"odemcen"}', dbo.aktualni_uzivatel());
  commit;
end;
GO

-- -----------------------------------------------------------------------------
-- Přihlášení heslem (náhrada Supabase Auth)
--
-- V provozu se kancelář přihlašuje heslem ze ZAKMATu: aplikace ho ověří pod
-- udrzba_app proti ZAKMAT.dbo.UZIVATEL (procedura s EXECUTE AS OWNER do jiné
-- databáze nesmí) a sem pošle jen osobní číslo -> osoba_pro_prihlaseni.
-- Při vývoji a v e2e testech (PRIHLASENI_ZDROJ=vlastni) se seedové účty
-- přihlašují vlastním heslem z dbo.prihlaseni -> nacti_prihlaseni.
--
-- Obě čtecí procedury běží před přihlášením, kdy řádková omezení nad profil
-- nikoho nepustí - proto EXECUTE AS OWNER. nastav_heslo naopak EXECUTE AS
-- nemá: k tabulce ji pustí řetězení vlastnictví a IS_MEMBER pak vidí
-- skutečného volajícího - administrátora v aplikaci, nebo skript seedu jako
-- člena db_owner.
-- -----------------------------------------------------------------------------

-- Osoba k osobnímu číslu, jehož heslo aplikace právě ověřila v ZAKMATu.
create procedure dbo.osoba_pro_prihlaseni
  @osobni_cislo int
with execute as owner
as
begin
  set nocount on;
  select p.id as osoba_id, p.aktivni,
         iif(exists (select 1 from dbo.uzivatel_role ur where ur.uzivatel_id = p.id), 1, 0) as ma_roli
  from dbo.profil p
  where p.osobni_cislo = @osobni_cislo;
end;
GO

-- Zámek přihlášení heslem: 5 chyb = 15 minut. Jméno posílá aplikace už
-- normalizované (malá písmena, bez domény). stav_pokusu_hesla vrací zamceno_do
-- (NULL = volno); zapis_pokusu_hesla se volá po každém ověření, mimo transakci,
-- kterou by aplikace mohla vrátit.
create procedure dbo.stav_pokusu_hesla
  @jmeno nvarchar(254)
as
begin
  set nocount on;
  select iif(zamceno_do > sysutcdatetime(), zamceno_do, null) as zamceno_do
  from (select max(zamceno_do) as zamceno_do from dbo.pokus_hesla where jmeno = @jmeno) x;
end;
GO

create procedure dbo.zapis_pokusu_hesla
  @jmeno  nvarchar(254),
  @uspech bit
as
begin
  set nocount on;
  set xact_abort on;

  begin tran;
    if @uspech = 1
      delete from dbo.pokus_hesla where jmeno = @jmeno;
    else
    begin
      update dbo.pokus_hesla with (updlock, holdlock)
      set chyb = chyb + 1,
          zamceno_do = iif((chyb + 1) % 5 = 0, dateadd(minute, 15, sysutcdatetime()), zamceno_do),
          zmeneno_at = sysutcdatetime()
      where jmeno = @jmeno;
      if @@rowcount = 0
        insert into dbo.pokus_hesla (jmeno, chyb) values (@jmeno, 1);
    end;
  commit;
end;
GO

create procedure dbo.nacti_prihlaseni
  @email nvarchar(254)
with execute as owner
as
begin
  set nocount on;
  select p.id as osoba_id, h.heslo_hash, p.aktivni
  from dbo.profil p
  join dbo.prihlaseni h on h.profil_id = p.id
  where p.email = ltrim(rtrim(@email));
end;
GO

create procedure dbo.nastav_heslo
  @profil_id  uniqueidentifier,
  @heslo_hash nvarchar(300)
as
begin
  set nocount on;
  set xact_abort on;

  if is_member(N'db_owner') = 0 and dbo.ma_roli(N'administrator') = 0
    throw 50013, N'Heslo smí nastavit jen administrátor.', 1;
  if @heslo_hash is null or len(ltrim(rtrim(@heslo_hash))) = 0
    throw 50303, N'Hash hesla nesmí být prázdný.', 1;
  if not exists (select 1 from dbo.profil where id = @profil_id)
    throw 50204, N'Osoba neexistuje.', 1;

  begin tran;
    update dbo.prihlaseni set heslo_hash = @heslo_hash, zmeneno_at = sysutcdatetime()
    where profil_id = @profil_id;
    if @@rowcount = 0
      insert into dbo.prihlaseni (profil_id, heslo_hash) values (@profil_id, @heslo_hash);

    -- Přihlášení vydaná se starým heslem přestanou platit.
    update dbo.profil set relace_platne_od = sysutcdatetime() where id = @profil_id;
  commit;
end;
GO

-- -----------------------------------------------------------------------------
-- Role a oblasti osoby (správa uživatelů, M6)
--
-- Tabulky uzivatel_role a uzivatel_oblast nemají řádkový filtr (zacyklil by se
-- s pomocnými funkcemi oprávnění) a aplikace na ně nemá právo - čte přes
-- pohledy v_uzivatel_role / v_uzivatel_oblast (0005) a zapisuje tady. Stav se
-- nastaví celý: co v seznamu není, se odebere. Smí jen administrátor (dřív
-- politiky uzivatel_role_zapis / uzivatel_oblast_zapis).
--   @role    = JSON pole id rolí:              ["<uuid>", ...]
--   @oblasti = JSON pole oblastí se vztahem:   [{"oblast_id":"<uuid>","vztah":"garant"}, ...]
-- -----------------------------------------------------------------------------

create procedure dbo.nastav_role_osoby
  @osoba uniqueidentifier,
  @role  nvarchar(max)
as
begin
  set nocount on;
  set xact_abort on;

  if is_member(N'db_owner') = 0 and dbo.ma_roli(N'administrator') = 0
    throw 50017, N'Role smí přidělovat jen administrátor.', 1;
  if @role is null or isjson(@role) = 0
    throw 50309, N'Seznam rolí není platný JSON.', 1;

  declare @nove table (role_id uniqueidentifier primary key);
  insert into @nove (role_id)
  select distinct try_cast(r.[value] as uniqueidentifier)
  from openjson(@role) r
  where try_cast(r.[value] as uniqueidentifier) is not null;

  begin tran;
    delete ur from dbo.uzivatel_role ur
    where ur.uzivatel_id = @osoba
      and not exists (select 1 from @nove n where n.role_id = ur.role_id);

    insert into dbo.uzivatel_role (uzivatel_id, role_id)
    select @osoba, n.role_id from @nove n
    where not exists (select 1 from dbo.uzivatel_role ur where ur.uzivatel_id = @osoba and ur.role_id = n.role_id);
  commit;
end;
GO

create procedure dbo.nastav_oblasti_osoby
  @osoba   uniqueidentifier,
  @oblasti nvarchar(max)
as
begin
  set nocount on;
  set xact_abort on;

  if is_member(N'db_owner') = 0 and dbo.ma_roli(N'administrator') = 0
    throw 50018, N'Oblasti smí přidělovat jen administrátor.', 1;
  if @oblasti is null or isjson(@oblasti) = 0
    throw 50310, N'Seznam oblastí není platný JSON.', 1;

  declare @nove table (oblast_id uniqueidentifier primary key, vztah nvarchar(30) not null);
  insert into @nove (oblast_id, vztah)
  select try_cast(json_value(o.[value], N'$.oblast_id') as uniqueidentifier),
         isnull(json_value(o.[value], N'$.vztah'), N'spolupracujici')
  from openjson(@oblasti) o
  where try_cast(json_value(o.[value], N'$.oblast_id') as uniqueidentifier) is not null;

  begin tran;
    delete uo from dbo.uzivatel_oblast uo
    where uo.uzivatel_id = @osoba
      and not exists (select 1 from @nove n where n.oblast_id = uo.oblast_id);

    update uo set vztah = n.vztah
    from dbo.uzivatel_oblast uo
    join @nove n on n.oblast_id = uo.oblast_id
    where uo.uzivatel_id = @osoba and uo.vztah <> n.vztah;

    insert into dbo.uzivatel_oblast (uzivatel_id, oblast_id, vztah)
    select @osoba, n.oblast_id, n.vztah from @nove n
    where not exists (select 1 from dbo.uzivatel_oblast uo where uo.uzivatel_id = @osoba and uo.oblast_id = n.oblast_id);
  commit;
end;
GO

-- -----------------------------------------------------------------------------
-- Noční plánovač (náhrada pg_cron; úloha Agenta v R7)
--
-- Jediné, co smí udrzba_planovac spustit. Každý běh se zapíše do planovac_beh
-- i s chybou - běh se zapisuje mimo transakci zakládání, takže po chybě
-- zůstane stopa, i když se zakázky vrátí.
-- -----------------------------------------------------------------------------

create procedure dbo.spust_planovac
with execute as owner
as
begin
  set nocount on;

  insert into dbo.planovac_beh default values;
  declare @beh bigint = scope_identity(), @pocet int;

  begin try
    exec dbo.zaloz_zakazky @okno_dnu = 14, @zarizeni = null, @pocet = @pocet output;
    update dbo.planovac_beh set konec = sysutcdatetime(), pocet = @pocet where id = @beh;
  end try
  begin catch
    if @@trancount > 0 rollback;
    update dbo.planovac_beh set konec = sysutcdatetime(), chyba = error_message() where id = @beh;
    throw;
  end catch;
end;
GO
