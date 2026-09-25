-- =============================================================================
-- Test procedur (0004): verze šablony, srovnání plánu, zakládání a dokončení
-- zakázek, oprávnění, karta a osobní číslo, přihlášení, plánovač.
-- Případy převzaté ze supabase/tests/sablony.sql, plan.sql a planovac.sql.
--
-- Úmluva (scripts/mssql-testy.mjs): autocommit jako vlastník databáze,
-- neúspěch = THROW 60000, průběh PRINT. Fixtury natrvalo s pevnými id
-- (...b0xx), očekávané chyby v TRY/CATCH. Uklidí spouštěč.
-- Vyžaduje celý seed včetně osob.
-- =============================================================================
set nocount on;

-- 1. Návrh a aktivace verze ---------------------------------------------------
declare @oblast uniqueidentifier = (select id from dbo.oblast where kod = N'cnc');
declare @cnc_role uniqueidentifier = (select id from dbo.[role] where kod = N'specialista_cnc');
declare @udrzbar_role uniqueidentifier = (select id from dbo.[role] where kod = N'udrzbar');
declare @sablona uniqueidentifier = '00000000-0000-0000-0000-00000000b001';
declare @vysledek table (id uniqueidentifier);
declare @v1 uniqueidentifier, @v2 uniqueidentifier;

insert into dbo.sablona (id, oblast_id, kod, nazev) values (@sablona, @oblast, N'test_procedury', N'Test procedur');

insert into @vysledek exec dbo.zaloz_navrh_verze @sablona_id = @sablona;
set @v1 = (select id from @vysledek);
if (select cislo_verze from dbo.sablona_verze where id = @v1) <> 1
  throw 60000, N'1: první návrh nemá číslo 1', 1;

begin try
  exec dbo.aktivuj_verzi @verze_id = @v1;
  throw 60000, N'1: prázdná verze šla aktivovat', 1;
end try
begin catch
  if error_number() <> 50152 throw 60000, N'1: prázdná verze - čekána chyba 50152', 1;
end catch;

-- Tři úkony: dva týdenní pro CNC (jeden s povinnou fotkou), jeden měsíční
-- pro údržbáře - skupina se rozpadne podle profese.
insert into dbo.sablona_ukon (id, sablona_verze_id, poradi, nazev, interval_typ, interval_hodnota, profese_role_id, vyzaduje_foto, nabizi_poznamku)
values
  ('00000000-0000-0000-0000-00000000b011', @v1, 1, N'Mazání vedení', N'tydny',  1, @cnc_role,     0, 1),
  ('00000000-0000-0000-0000-00000000b012', @v1, 2, N'Kontrola krytu', N'tydny', 1, @cnc_role,     1, 0),
  ('00000000-0000-0000-0000-00000000b013', @v1, 3, N'Čištění filtru', N'mesice', 1, @udrzbar_role, 0, 0);

delete from @vysledek;
insert into @vysledek exec dbo.zaloz_navrh_verze @sablona_id = @sablona;
if (select id from @vysledek) <> @v1
  throw 60000, N'1: existující návrh se nevrátil beze změny', 1;

exec dbo.aktivuj_verzi @verze_id = @v1;
if (select stav from dbo.sablona_verze where id = @v1) <> N'aktivni'
  throw 60000, N'1: návrh se neaktivoval', 1;

begin try
  exec dbo.aktivuj_verzi @verze_id = @v1;
  throw 60000, N'1: aktivní verze šla aktivovat znovu', 1;
end try
begin catch
  if error_number() <> 50151 throw 60000, N'1: znovu aktivace - čekána chyba 50151', 1;
end catch;

begin try
  exec dbo.aktivuj_verzi @verze_id = '00000000-0000-0000-0000-0000000000ff';
  throw 60000, N'1: neexistující verze prošla', 1;
end try
begin catch
  if error_number() <> 50202 throw 60000, N'1: neexistující verze - čekána chyba 50202', 1;
end catch;

-- Druhý návrh zkopíruje matici i se stálými klíči a nabizi_poznamku.
delete from @vysledek;
insert into @vysledek exec dbo.zaloz_navrh_verze @sablona_id = @sablona;
set @v2 = (select id from @vysledek);
if (select cislo_verze from dbo.sablona_verze where id = @v2) <> 2
  throw 60000, N'1: druhý návrh nemá číslo 2', 1;
if (select count(*) from dbo.sablona_ukon n
    join dbo.sablona_ukon s on s.klic = n.klic and s.sablona_verze_id = @v1
    where n.sablona_verze_id = @v2 and n.nabizi_poznamku = s.nabizi_poznamku) <> 3
  throw 60000, N'1: kopie matice nepřenesla klíče nebo nabizi_poznamku', 1;
print N'1. návrh a aktivace verze';
GO

-- 2. Plán drží krok s maticí --------------------------------------------------
declare @sablona uniqueidentifier = '00000000-0000-0000-0000-00000000b001';
declare @oblast uniqueidentifier = (select id from dbo.oblast where kod = N'cnc');
declare @stroj uniqueidentifier = (select top (1) id from dbo.zarizeni where oblast_id = @oblast order by nazev);
declare @v2 uniqueidentifier = (select id from dbo.sablona_verze where sablona_id = @sablona and stav = N'navrh');

insert into dbo.zarizeni_sablona (zarizeni_id, sablona_id, oblast_id) values (@stroj, @sablona, @oblast);
if (select count(*) from dbo.plan_udrzby where zarizeni_id = @stroj and sablona_id = @sablona and aktivni = 1) <> 3
  throw 60000, N'2: přiřazení šablony nezaložilo tři řádky plánu', 1;

-- Garant zadá termín jednomu úkonu; nová verze bez čištění filtru ho nesmí
-- posunout a vyřazený úkon přestane být aktivní.
update dbo.plan_udrzby set dalsi_termin = '2030-01-01'
where zarizeni_id = @stroj and sablona_id = @sablona
  and ukon_klic = (select klic from dbo.sablona_ukon where id = '00000000-0000-0000-0000-00000000b011');
delete from dbo.sablona_ukon where sablona_verze_id = @v2 and nazev = N'Čištění filtru';
exec dbo.aktivuj_verzi @verze_id = @v2;

if (select count(*) from dbo.plan_udrzby where zarizeni_id = @stroj and sablona_id = @sablona and aktivni = 1) <> 2
  throw 60000, N'2: úkon vyřazený z matice zůstal v plánu aktivní', 1;
if not exists (select 1 from dbo.plan_udrzby where zarizeni_id = @stroj and sablona_id = @sablona and dalsi_termin = '2030-01-01')
  throw 60000, N'2: nová verze přepsala termín zadaný garantem', 1;
print N'2. plán drží krok s maticí';
GO

-- 3. Zakládání zakázek --------------------------------------------------------
declare @sablona uniqueidentifier = '00000000-0000-0000-0000-00000000b001';
declare @oblast uniqueidentifier = (select id from dbo.oblast where kod = N'cnc');
declare @stroj uniqueidentifier = (select top (1) id from dbo.zarizeni where oblast_id = @oblast order by nazev);
declare @pocet int;

update dbo.plan_udrzby set dalsi_termin = dbo.dnes()
where zarizeni_id = @stroj and sablona_id = @sablona and aktivni = 1;

begin try
  exec dbo.zaloz_zakazky @okno_dnu = -1, @zarizeni = @stroj, @pocet = @pocet output;
  throw 60000, N'3: záporné okno prošlo', 1;
end try
begin catch
  if error_number() <> 50301 throw 60000, N'3: záporné okno - čekána chyba 50301', 1;
end catch;

exec dbo.zaloz_zakazky @okno_dnu = 14, @zarizeni = @stroj, @pocet = @pocet output;
if @pocet <> 2 throw 60000, N'3: splatné dva úkony nedaly dva kroky', 1;
if (select count(*) from dbo.zakazka where zarizeni_id = @stroj and stav = N'naplanovano') <> 1
  throw 60000, N'3: dva úkony téže profese a dne nejsou v jedné zakázce', 1;

exec dbo.zaloz_zakazky @okno_dnu = 14, @zarizeni = @stroj, @pocet = @pocet output;
if @pocet <> 0 throw 60000, N'3: druhý běh založil kroky znovu (není idempotentní)', 1;
print N'3. zakládání zakázek';
GO

-- 4. Naplánování na požádání - oprávnění --------------------------------------
declare @oblast uniqueidentifier = (select id from dbo.oblast where kod = N'cnc');
declare @stroj uniqueidentifier = (select top (1) id from dbo.zarizeni where oblast_id = @oblast order by nazev);
declare @udrzbar uniqueidentifier = (select id from dbo.profil where email = N'udrzbar@senco.test');
declare @cnc uniqueidentifier = (select id from dbo.profil where email = N'cnc@senco.test');
declare @vysledek table (pocet int);

exec sys.sp_set_session_context @key = N'osoba_id', @value = @udrzbar;
begin try
  exec dbo.naplanuj_zarizeni @zarizeni = @stroj;
  throw 60000, N'4: údržbář bez práva na šablony naplánoval stroj', 1;
end try
begin catch
  if error_number() <> 50012 throw 60000, N'4: cizí oblast - čekána chyba 50012', 1;
end catch;

exec sys.sp_set_session_context @key = N'osoba_id', @value = @cnc;
insert into @vysledek exec dbo.naplanuj_zarizeni @zarizeni = @stroj;
if (select pocet from @vysledek) <> 0
  throw 60000, N'4: naplánování už naplánovaného stroje nevrátilo 0', 1;

begin try
  exec dbo.naplanuj_zarizeni @zarizeni = '00000000-0000-0000-0000-0000000000ff';
  throw 60000, N'4: neexistující stroj prošel', 1;
end try
begin catch
  if error_number() <> 50203 throw 60000, N'4: neexistující stroj - čekána chyba 50203', 1;
end catch;
exec sys.sp_set_session_context @key = N'osoba_id', @value = null;
print N'4. naplánování na požádání';
GO

-- 5. Dokončení zakázky --------------------------------------------------------
declare @oblast uniqueidentifier = (select id from dbo.oblast where kod = N'cnc');
declare @stroj uniqueidentifier = (select top (1) id from dbo.zarizeni where oblast_id = @oblast order by nazev);
declare @zakazka uniqueidentifier = (select id from dbo.zakazka where zarizeni_id = @stroj and stav = N'naplanovano');
declare @cnc uniqueidentifier = (select id from dbo.profil where email = N'cnc@senco.test');
declare @management uniqueidentifier = (select id from dbo.profil where email = N'management@senco.test');

exec sys.sp_set_session_context @key = N'osoba_id', @value = @management;
begin try
  exec dbo.dokonci_zakazku @zakazka = @zakazka;
  throw 60000, N'5: management dokončil zakázku', 1;
end try
begin catch
  if error_number() <> 50011 throw 60000, N'5: management - čekána chyba 50011', 1;
end catch;

exec sys.sp_set_session_context @key = N'osoba_id', @value = @cnc;
begin try
  exec dbo.dokonci_zakazku @zakazka = '00000000-0000-0000-0000-0000000000ff';
  throw 60000, N'5: neexistující zakázka prošla', 1;
end try
begin catch
  if error_number() <> 50201 throw 60000, N'5: neexistující zakázka - čekána chyba 50201', 1;
end catch;

begin try
  exec dbo.dokonci_zakazku @zakazka = @zakazka;
  throw 60000, N'5: zakázka s nevyřízenými kroky šla dokončit', 1;
end try
begin catch
  if error_number() <> 50142 throw 60000, N'5: nevyřízené kroky - čekána chyba 50142', 1;
end catch;

update dbo.zakazka_ukon set stav = N'splneno', potvrzeno_at = sysutcdatetime(), potvrdil_id = @cnc
where zakazka_id = @zakazka;
begin try
  exec dbo.dokonci_zakazku @zakazka = @zakazka;
  throw 60000, N'5: krok s povinnou fotkou prošel bez fotky', 1;
end try
begin catch
  if error_number() <> 50143 throw 60000, N'5: chybí fotka - čekána chyba 50143', 1;
end catch;

insert into dbo.zakazka_foto (zakazka_ukon_id, storage_path)
select id, N'test/b-' + lower(cast(id as nchar(36))) + N'.jpg'
from dbo.zakazka_ukon where zakazka_id = @zakazka and vyzaduje_foto = 1;

exec dbo.dokonci_zakazku @zakazka = @zakazka;
if (select stav from dbo.zakazka where id = @zakazka) <> N'dokonceno'
   or (select dokoncil_id from dbo.zakazka where id = @zakazka) <> @cnc
  throw 60000, N'5: zakázka není dokončená přihlášenou osobou', 1;
-- Týdenní úkon od_planu: plán dnes, hotovo dnes -> za týden.
if exists (select 1 from dbo.plan_udrzby p
           join dbo.zakazka_ukon u on u.plan_udrzby_id = p.id
           where u.zakazka_id = @zakazka
             and (p.dalsi_termin <> dateadd(day, 7, dbo.dnes()) or p.posledni_provedeno_at is null))
  throw 60000, N'5: plán se po dokončení neposunul o týden', 1;

begin try
  exec dbo.dokonci_zakazku @zakazka = @zakazka;
  throw 60000, N'5: uzavřená zakázka šla dokončit znovu', 1;
end try
begin catch
  if error_number() <> 50141 throw 60000, N'5: znovu dokončení - čekána chyba 50141', 1;
end catch;
exec sys.sp_set_session_context @key = N'osoba_id', @value = null;
print N'5. dokončení zakázky';
GO

-- 6. Karta a osobní číslo -----------------------------------------------------
declare @kiosek uniqueidentifier = (select id from dbo.profil where osobni_cislo = 9001);
declare @osoby table (id uniqueidentifier, jmeno nvarchar(100), prijmeni nvarchar(100), osobni_cislo int);
if @kiosek is null throw 60000, N'6: chybí seed kiosku (osobní číslo 9001)', 1;

exec sys.sp_set_session_context @key = N'osoba_id', @value = @kiosek;
insert into @osoby exec dbo.osoba_podle_karty @cislo = N' KARTA-2001 ';
if (select count(*) from @osoby where osobni_cislo = 2001) <> 1
  throw 60000, N'6: kiosek strojní nepoznal kartu člověka ze strojní', 1;

delete from @osoby;
insert into @osoby exec dbo.osoba_podle_karty @cislo = N'KARTA-2002';
if exists (select 1 from @osoby)
  throw 60000, N'6: kiosek strojní poznal člověka z lakovny', 1;

delete from @osoby;
insert into @osoby exec dbo.osoba_podle_osobniho_cisla @cislo = N' 2001 ';
if (select count(*) from @osoby) <> 1
  throw 60000, N'6: osobní číslo nenašlo člověka ze strojní', 1;

delete from @osoby;
insert into @osoby exec dbo.osoba_podle_osobniho_cisla @cislo = N'nesmysl';
if exists (select 1 from @osoby)
  throw 60000, N'6: nesmyslné osobní číslo někoho našlo', 1;
exec sys.sp_set_session_context @key = N'osoba_id', @value = null;
print N'6. karta a osobní číslo';
GO

-- 7. Přihlášení ---------------------------------------------------------------
declare @zaznam table (osoba_id uniqueidentifier, heslo_hash nvarchar(300), aktivni bit);
insert into @zaznam exec dbo.nacti_prihlaseni @email = N'  ADMIN@senco.test ';
if (select count(*) from @zaznam where heslo_hash like N'scrypt%' or len(heslo_hash) > 20) <> 1
  throw 60000, N'7: nacti_prihlaseni nevrátil hash seedovaného správce', 1;

delete from @zaznam;
insert into @zaznam exec dbo.nacti_prihlaseni @email = N'nikdo@senco.test';
if exists (select 1 from @zaznam) throw 60000, N'7: neznámý e-mail vrátil záznam', 1;

-- Osoba bez přihlášení (dílna) dostane heslo; staré relace přestanou platit.
declare @osoba uniqueidentifier = (select id from dbo.profil where osobni_cislo = 2001);
exec dbo.nastav_heslo @profil_id = @osoba, @heslo_hash = N'test-hash-1';
exec dbo.nastav_heslo @profil_id = @osoba, @heslo_hash = N'test-hash-2';
if (select heslo_hash from dbo.prihlaseni where profil_id = @osoba) <> N'test-hash-2'
  throw 60000, N'7: nastav_heslo nepřepsal hash', 1;
if (select relace_platne_od from dbo.profil where id = @osoba) is null
  throw 60000, N'7: nastav_heslo nezneplatnil staré relace', 1;

begin try
  exec dbo.nastav_heslo @profil_id = @osoba, @heslo_hash = N'  ';
  throw 60000, N'7: prázdný hash prošel', 1;
end try
begin catch
  if error_number() <> 50303 throw 60000, N'7: prázdný hash - čekána chyba 50303', 1;
end catch;
-- Odmítnutí neadministrátora ověří test práv v R3 (pod udrzba_app).
print N'7. přihlášení';
GO

-- 8. Noční plánovač -----------------------------------------------------------
declare @pred bigint = isnull((select max(id) from dbo.planovac_beh), 0);
exec dbo.spust_planovac;
if not exists (select 1 from dbo.planovac_beh
               where id > @pred and konec is not null and pocet is not null and chyba is null)
  throw 60000, N'8: běh plánovače není zapsaný v planovac_beh', 1;
print N'8. noční plánovač';
GO

print N'Test procedury prošel.';
