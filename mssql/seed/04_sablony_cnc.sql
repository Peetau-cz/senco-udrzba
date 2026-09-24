-- =============================================================================
-- Šablona údržby pro oblast CNC (modul M2) - přepis supabase/seed_sablony_cnc.sql.
--
-- Zdroj: docs/Harmonogram_udrzby_CNC_stroju.xlsx, sloupce "Interval" a
-- "Úkon údržby". Navazuje na 03_cnc.sql (typy a stroje z téhož souboru).
--
-- Jedna šablona pro všech pět strojů: tabulka má u každého tentýž seznam
-- šestnácti úkonů. Doplněno nad rámec tabulky (beze změny proti Supabase):
-- interval_zaklad od_planu u všech, dvě revize elektro patří specialistovi
-- elektro, pole na rozepsání mají revize a kalibrace, tolerance nula.
--
-- Idempotentní. Matici zakládá jen tehdy, když šablona ještě žádnou verzi
-- nemá - jinak by přepsala, co garant mezitím zverzoval.
-- =============================================================================

declare @oblast  uniqueidentifier = (select id from dbo.oblast where kod = N'cnc');
declare @cnc     uniqueidentifier = (select id from dbo.[role] where kod = N'specialista_cnc');
declare @elektro uniqueidentifier = (select id from dbo.[role] where kod = N'specialista_elektro');

if @oblast is null or @cnc is null
  throw 50300, N'04_sablony_cnc: chybí oblast cnc nebo role specialista_cnc (01_ciselniky.sql).', 1;
-- Kdyby role elektro v číselníku nebyla, úkony připadnou CNC a garant je přehodí.
set @elektro = isnull(@elektro, @cnc);

merge dbo.sablona as cil
using (select @oblast as oblast_id, N'cnc_zakladni' as kod,
              N'Základní údržba CNC strojů' as nazev,
              N'Společná matice pro všechny stroje z harmonogramu CNC. Zdroj: docs/Harmonogram_udrzby_CNC_stroju.xlsx.' as popis) as zdroj
on cil.kod = zdroj.kod
when matched and (cil.nazev <> zdroj.nazev or isnull(cil.popis, N'') <> zdroj.popis) then
  update set nazev = zdroj.nazev, popis = zdroj.popis
when not matched then
  insert (oblast_id, kod, nazev, popis) values (zdroj.oblast_id, zdroj.kod, zdroj.nazev, zdroj.popis);

declare @sablona uniqueidentifier = (select id from dbo.sablona where kod = N'cnc_zakladni');

if exists (select 1 from dbo.sablona_verze where sablona_id = @sablona)
  print N'04_sablony_cnc: šablona cnc_zakladni už nějakou verzi má - matice se nepřepisuje.';
else
begin
  declare @navrh table (id uniqueidentifier);
  insert into @navrh exec dbo.zaloz_navrh_verze @sablona_id = @sablona;
  declare @verze uniqueidentifier = (select id from @navrh);

  insert into dbo.sablona_ukon (
    sablona_verze_id, poradi, nazev, interval_typ, interval_hodnota, interval_zaklad,
    profese_role_id, nabizi_poznamku
  )
  values
    -- Týdenní
    (@verze,  1, N'Vyčištění pracovního prostoru a stolu', N'tydny',  1, N'od_planu', @cnc,     0),
    (@verze,  2, N'Kontrola hladiny chladicí kapaliny',    N'tydny',  1, N'od_planu', @cnc,     0),
    (@verze,  3, N'Mazání vedení a pohyblivých částí',     N'tydny',  1, N'od_planu', @cnc,     0),
    (@verze,  4, N'Kontrola tlaku vzduchu a filtru',       N'tydny',  1, N'od_planu', @cnc,     0),
    -- Měsíční
    (@verze,  5, N'Kontrola dotažení šroubových spojů',    N'mesice', 1, N'od_planu', @cnc,     0),
    (@verze,  6, N'Kontrola olejového systému',            N'mesice', 1, N'od_planu', @cnc,     0),
    (@verze,  7, N'Vyčištění filtrů ventilace a chlazení', N'mesice', 1, N'od_planu', @cnc,     0),
    (@verze,  8, N'Kontrola funkce bezpečnostních prvků',  N'mesice', 1, N'od_planu', @cnc,     0),
    -- Čtvrtletní = tři kalendářní měsíce
    (@verze,  9, N'Kalibrace os a kontrola přesnosti',     N'mesice', 3, N'od_planu', @cnc,     1),
    (@verze, 10, N'Kontrola ložisek a vůlí',               N'mesice', 3, N'od_planu', @cnc,     0),
    (@verze, 11, N'Revize elektrických připojení',         N'mesice', 3, N'od_planu', @elektro, 1),
    (@verze, 12, N'Kontrola mazacího systému',             N'mesice', 3, N'od_planu', @cnc,     0),
    -- Roční
    (@verze, 13, N'Kompletní revize stroje',               N'roky',   1, N'od_planu', @cnc,     1),
    (@verze, 14, N'Výměna olejů a filtrů',                 N'roky',   1, N'od_planu', @cnc,     0),
    (@verze, 15, N'Kontrola a případná výměna těsnění',    N'roky',   1, N'od_planu', @cnc,     0),
    (@verze, 16, N'Revize elektroinstalace a senzorů',     N'roky',   1, N'od_planu', @elektro, 1);

  exec dbo.aktivuj_verzi @verze_id = @verze;
  print N'04_sablony_cnc: založena a aktivována verze 1 šablony cnc_zakladni (16 úkonů).';
end;

-- Přiřazení všem pěti strojům z harmonogramu; plán založí trigger
-- zarizeni_sablona_plan. Přidá jen chybějící.
insert into dbo.zarizeni_sablona (zarizeni_id, sablona_id, oblast_id)
select z.id, @sablona, z.oblast_id
from dbo.zarizeni z
join dbo.typ_zarizeni t on t.id = z.typ_zarizeni_id
where z.oblast_id = @oblast
  and t.kod in (N'frezka', N'soustruh', N'vysekavacka', N'ohranovak', N'lici_stroj')
  and not exists (select 1 from dbo.zarizeni_sablona zs where zs.zarizeni_id = z.id and zs.sablona_id = @sablona);

declare @pocet int = (select count(*) from dbo.zarizeni_sablona where sablona_id = @sablona);
print N'04_sablony_cnc: šablonu cnc_zakladni používá ' + cast(@pocet as nvarchar(10)) + N' zařízení.';
