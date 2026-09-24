-- =============================================================================
-- Test pohledů (0005): dnešní plán a restance, plnění matice, připravenost
-- plánu, historie zařízení. Případy převzaté ze supabase/tests/plneni.sql,
-- pripravenost.sql a historie.sql. Viditelnost přes pohledy (RLS) je v R3.
--
-- Úmluva (scripts/mssql-testy.mjs): autocommit jako vlastník databáze,
-- neúspěch = THROW 60000, průběh PRINT. Vlastní oblast test_pohledy, ať čísla
-- nezkreslí seed; fixtury natrvalo s pevnými id (...c0xx). Uklidí spouštěč.
-- =============================================================================
set nocount on;

-- Fixtury ---------------------------------------------------------------------
declare @oblast uniqueidentifier = '00000000-0000-0000-0000-00000000c001';
declare @typ    uniqueidentifier = '00000000-0000-0000-0000-00000000c002';
declare @role   uniqueidentifier = (select id from dbo.[role] where kod = N'udrzbar');

insert into dbo.oblast (id, kod, nazev) values (@oblast, N'test_pohledy', N'Test pohledů');
insert into dbo.typ_zarizeni (id, oblast_id, kod, nazev) values (@typ, @oblast, N'test_pohledy_typ', N'Test');
insert into dbo.zarizeni (id, oblast_id, typ_zarizeni_id, nazev, stav) values
  ('00000000-0000-0000-0000-00000000c011', @oblast, @typ, N'Bez šablony', N'v_provozu'),
  ('00000000-0000-0000-0000-00000000c012', @oblast, @typ, N'Šablona bez platné verze', N'v_provozu'),
  ('00000000-0000-0000-0000-00000000c013', @oblast, @typ, N'Chybí termín', N'v_provozu'),
  ('00000000-0000-0000-0000-00000000c014', @oblast, @typ, N'Hotový plán', N'v_provozu'),
  ('00000000-0000-0000-0000-00000000c015', @oblast, @typ, N'Odstavený', N'odstaveno');

-- Šablona S1 jen s návrhem, šablona S2 s platnou verzí o dvou úkonech.
insert into dbo.sablona (id, oblast_id, kod, nazev) values
  ('00000000-0000-0000-0000-00000000c021', @oblast, N'test_pohledy_s1', N'S1'),
  ('00000000-0000-0000-0000-00000000c022', @oblast, N'test_pohledy_s2', N'Údržba S2');
insert into dbo.sablona_verze (id, sablona_id, cislo_verze) values
  ('00000000-0000-0000-0000-00000000c031', '00000000-0000-0000-0000-00000000c021', 1),
  ('00000000-0000-0000-0000-00000000c032', '00000000-0000-0000-0000-00000000c022', 1);
insert into dbo.sablona_ukon (sablona_verze_id, poradi, nazev, interval_typ, interval_hodnota, profese_role_id) values
  ('00000000-0000-0000-0000-00000000c031', 1, N'A', N'tydny', 1, @role),
  ('00000000-0000-0000-0000-00000000c032', 1, N'B', N'tydny', 1, @role),
  ('00000000-0000-0000-0000-00000000c032', 2, N'C', N'mesice', 1, @role);
update dbo.sablona_verze set stav = N'aktivni', platna_od = sysutcdatetime()
where id = '00000000-0000-0000-0000-00000000c032';

insert into dbo.zarizeni_sablona (zarizeni_id, sablona_id, oblast_id) values
  ('00000000-0000-0000-0000-00000000c012', '00000000-0000-0000-0000-00000000c021', @oblast),
  ('00000000-0000-0000-0000-00000000c013', '00000000-0000-0000-0000-00000000c022', @oblast),
  ('00000000-0000-0000-0000-00000000c014', '00000000-0000-0000-0000-00000000c022', @oblast),
  ('00000000-0000-0000-0000-00000000c015', '00000000-0000-0000-0000-00000000c022', @oblast);
update dbo.plan_udrzby set dalsi_termin = '2030-01-01' where zarizeni_id = '00000000-0000-0000-0000-00000000c014';
update top (1) dbo.plan_udrzby set dalsi_termin = '2030-01-01' where zarizeni_id = '00000000-0000-0000-0000-00000000c013';
GO

-- 1. Připravenost plánu -------------------------------------------------------
declare @oblast uniqueidentifier = '00000000-0000-0000-0000-00000000c001';
if (select stav_planu from dbo.v_pripravenost_zarizeni where zarizeni_id = '00000000-0000-0000-0000-00000000c011') <> N'bez_sablony'
  throw 60000, N'1: stroj bez šablony nemá stav bez_sablony', 1;
if (select stav_planu from dbo.v_pripravenost_zarizeni where zarizeni_id = '00000000-0000-0000-0000-00000000c012') <> N'bez_ukonu'
  throw 60000, N'1: šablona bez platné verze nedala bez_ukonu', 1;
if (select stav_planu from dbo.v_pripravenost_zarizeni where zarizeni_id = '00000000-0000-0000-0000-00000000c013') <> N'bez_terminu'
  throw 60000, N'1: úkon bez termínu nedal bez_terminu', 1;
if (select stav_planu + N'|' + cast(ukonu_celkem as nvarchar(5)) from dbo.v_pripravenost_zarizeni
    where zarizeni_id = '00000000-0000-0000-0000-00000000c014') <> N'ok|2'
  throw 60000, N'1: hotový plán nemá stav ok se dvěma úkony', 1;
if exists (select 1 from dbo.v_pripravenost_zarizeni where zarizeni_id = '00000000-0000-0000-0000-00000000c015')
  throw 60000, N'1: odstavený stroj se v pohledu objevil', 1;
print N'1. připravenost plánu';
GO

-- 2. Plnění matice ------------------------------------------------------------
-- Minulý měsíc: zakázka A (otevřená) s pěti kroky různých stavů, zakázka B
-- zrušená, zakázka C v budoucnu.
declare @oblast uniqueidentifier = '00000000-0000-0000-0000-00000000c001';
declare @stroj uniqueidentifier = '00000000-0000-0000-0000-00000000c014';
declare @verze uniqueidentifier = '00000000-0000-0000-0000-00000000c032';
declare @role uniqueidentifier = (select id from dbo.[role] where kod = N'udrzbar');
declare @d0 date = dateadd(month, -1, datefromparts(year(dbo.dnes()), month(dbo.dnes()), 1));
declare @a uniqueidentifier = '00000000-0000-0000-0000-00000000c041';
declare @b uniqueidentifier = '00000000-0000-0000-0000-00000000c042';
declare @c uniqueidentifier = '00000000-0000-0000-0000-00000000c043';

insert into dbo.zakazka (id, zarizeni_id, sablona_verze_id, profese_role_id, planovany_termin) values
  (@a, @stroj, @verze, @role, dateadd(day, 2, @d0)),
  (@b, @stroj, @verze, @role, dateadd(day, 3, @d0)),
  (@c, @stroj, @verze, @role, dateadd(day, 5, dbo.dnes()));

-- Potvrzení v 10:00 UTC = poledne v Praze, den sedí v obou pásmech.
insert into dbo.zakazka_ukon (zakazka_id, poradi, nazev_snapshot, stav, potvrzeno_at, tolerance_dny_snapshot, poznamka) values
  (@a, 1, N'včas',                N'splneno',       dateadd(hour, 10, cast(dateadd(day, 2, @d0) as datetime2(3))), 0, null),
  (@a, 2, N'pozdě',               N'splneno',       dateadd(hour, 10, cast(dateadd(day, 5, @d0) as datetime2(3))), 0, null),
  (@a, 3, N'v toleranci',         N'splneno',       dateadd(hour, 10, cast(dateadd(day, 4, @d0) as datetime2(3))), 3, null),
  (@a, 4, N'nešlo',               N'nelze_provest', dateadd(hour, 10, cast(dateadd(day, 2, @d0) as datetime2(3))), 0, N'stroj rozebraný'),
  (@a, 5, N'nic',                 N'nesplneno',     null, 0, null),
  (@b, 1, N'zrušené',             N'nesplneno',     null, 0, null),
  (@c, 1, N'budoucí',             N'nesplneno',     null, 0, null);
update dbo.zakazka set stav = N'zruseno' where id = @b;

declare @radek nvarchar(100) = (
  select concat(celkem, N'|', splneno, N'|', po_terminu, N'|', neprovedeno)
  from dbo.v_plneni_matice where oblast_id = @oblast and obdobi = @d0);
if isnull(@radek, N'chybí') <> N'4|2|2|1'
begin
  declare @zprava nvarchar(2048) = N'2: plnění matice čekáno 4|2|2|1 (celkem|splněno|po termínu|neprovedeno), je ' + isnull(@radek, N'chybí');
  throw 60000, @zprava, 1;
end;
if exists (select 1 from dbo.v_plneni_matice where oblast_id = @oblast and obdobi > dbo.dnes())
  throw 60000, N'2: budoucí termín se započítal do plnění', 1;
print N'2. plnění matice';
GO

-- 3. Dnešní plán a restance ---------------------------------------------------
declare @stroj uniqueidentifier = '00000000-0000-0000-0000-00000000c013';
declare @verze uniqueidentifier = '00000000-0000-0000-0000-00000000c032';
declare @role uniqueidentifier = (select id from dbo.[role] where kod = N'udrzbar');
declare @d uniqueidentifier = '00000000-0000-0000-0000-00000000c044';
insert into dbo.zakazka (id, zarizeni_id, sablona_verze_id, profese_role_id, planovany_termin)
values (@d, @stroj, @verze, @role, dbo.dnes());
insert into dbo.zakazka_ukon (zakazka_id, poradi, nazev_snapshot, stav, potvrzeno_at) values
  (@d, 1, N'hotovo', N'splneno', sysutcdatetime()),
  (@d, 2, N'zbývá', N'nesplneno', null);

if (select concat(kroku, N'|', vyrizeno) from dbo.v_dnesni_plan where zakazka_id = @d) <> N'2|1'
  throw 60000, N'3: dnešní plán nemá 2 kroky, 1 vyřízený', 1;
if exists (select 1 from dbo.v_dnesni_plan where zakazka_id = '00000000-0000-0000-0000-00000000c041')
  throw 60000, N'3: zakázka po termínu je v dnešním plánu', 1;

declare @a date = (select planovany_termin from dbo.zakazka where id = '00000000-0000-0000-0000-00000000c041');
if (select dnu_zpozdeni from dbo.v_po_terminu where zakazka_id = '00000000-0000-0000-0000-00000000c041')
   <> datediff(day, @a, dbo.dnes())
  throw 60000, N'3: restance nemá správný počet dnů zpoždění', 1;
if exists (select 1 from dbo.v_po_terminu
           where zakazka_id in ('00000000-0000-0000-0000-00000000c042', '00000000-0000-0000-0000-00000000c043', @d))
  throw 60000, N'3: zrušená, budoucí nebo dnešní zakázka je mezi restancemi', 1;
print N'3. dnešní plán a restance';
GO

-- 4. Historie zařízení --------------------------------------------------------
-- Dokončená zakázka se dvěma kroky a třemi fotkami u jednoho z nich (počty
-- se nesmí vynásobit), jeden zápis v deníku s fotkou, otevřená zakázka ne.
declare @oblast uniqueidentifier = '00000000-0000-0000-0000-00000000c001';
declare @stroj uniqueidentifier = '00000000-0000-0000-0000-00000000c011';
declare @verze uniqueidentifier = '00000000-0000-0000-0000-00000000c032';
declare @role uniqueidentifier = (select id from dbo.[role] where kod = N'udrzbar');
declare @hotova uniqueidentifier = '00000000-0000-0000-0000-00000000c051';
declare @krok uniqueidentifier = '00000000-0000-0000-0000-00000000c052';
declare @zapis uniqueidentifier = '00000000-0000-0000-0000-00000000c053';
declare @admin uniqueidentifier = (select id from dbo.profil where email = N'admin@senco.test');
declare @druh uniqueidentifier = (select id from dbo.druh_zasahu where kod = N'serizeni');

insert into dbo.zakazka (id, zarizeni_id, sablona_verze_id, profese_role_id, planovany_termin, poznamka)
values (@hotova, @stroj, @verze, @role, dateadd(day, -1, dbo.dnes()), N'Vše v pořádku');
insert into dbo.zakazka_ukon (id, zakazka_id, poradi, nazev_snapshot, stav, potvrzeno_at) values
  (@krok, @hotova, 1, N'B', N'splneno', sysutcdatetime());
insert into dbo.zakazka_ukon (zakazka_id, poradi, nazev_snapshot, stav, potvrzeno_at, poznamka) values
  (@hotova, 2, N'C', N'nelze_provest', sysutcdatetime(), N'chybí díl');
insert into dbo.zakazka_foto (zakazka_ukon_id, storage_path) values
  (@krok, N'test/c052-1.jpg'), (@krok, N'test/c052-2.jpg'), (@krok, N'test/c052-3.jpg');
update dbo.zakazka set stav = N'dokonceno', dokonceno_at = sysutcdatetime(), dokoncil_id = @admin where id = @hotova;
insert into dbo.zakazka (zarizeni_id, sablona_verze_id, profese_role_id, planovany_termin)
values (@stroj, @verze, @role, dbo.dnes());

exec sys.sp_set_session_context @key = N'osoba_id', @value = @admin;
insert into dbo.provozni_denik (id, zarizeni_id, oblast_id, druh_zasahu_id, popis, doba_trvani_min)
values (@zapis, @stroj, @oblast, @druh, N'Seřízení dorazu', 30);
insert into dbo.denik_foto (zaznam_id, storage_path) values (@zapis, N'test/c053.jpg');
exec sys.sp_set_session_context @key = N'osoba_id', @value = null;

if (select count(*) from dbo.v_historie_zarizeni where zarizeni_id = @stroj) <> 2
  throw 60000, N'4: historie nemá právě dokončenou zakázku a zápis z deníku', 1;
if (select concat(nazev, N'|', ukonu_celkem, N'|', ukonu_splneno, N'|', ukonu_neprovedeno, N'|', fotek)
    from dbo.v_historie_zarizeni where zaznam_id = @hotova) <> N'Údržba S2|2|1|1|3'
  throw 60000, N'4: zakázka v historii nemá název šablony a nevynásobené počty (2|1|1|3)', 1;
if (select concat(puvod, N'|', isnull(cast(ukonu_celkem as nvarchar(5)), N'null'), N'|', fotek, N'|', doba_trvani_min)
    from dbo.v_historie_zarizeni where zaznam_id = @zapis) <> N'denik|null|1|30'
  throw 60000, N'4: zápis z deníku v historii nemá NULL kroků, jednu fotku a dobu', 1;
print N'4. historie zařízení';
GO

print N'Test pohledy prošel.';
