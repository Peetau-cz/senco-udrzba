-- =============================================================================
-- Test schématu (0001): tvarové funkce JSON, výčtové CHECKy, filtrované
-- unikáty, kolace, šev identity.
--
-- Úmluva (scripts/mssql-testy.mjs): běží v autocommitu jako vlastník databáze,
-- neúspěch = THROW 60000, průběh PRINT. Kontroly, které nic nezapisují nebo
-- končí rollbackem, nechávají databázi čistou; zbytek uklidí spouštěč.
-- Vyžaduje seed (oblast cnc, typ frezka).
-- =============================================================================
set nocount on;

-- 1. Všechny tabulky existují (kdyby SQL Server odmítl kaskádové cesty, chyba
--    1785 by zastavila už migraci - tady se jen počítá výsledek).
declare @tabulek int = (select count(*) from sys.tables where schema_id = schema_id(N'dbo') and name <> N'_migrace');
if @tabulek <> 24
  throw 60000, N'1: očekáváno 24 tabulek (22 + prihlaseni + planovac_beh)', 1;
print N'1. tabulek: 24';
GO

-- 2. Šev identity: bez kontextu NULL, s kontextem id osoby, s nesmyslem NULL.
if dbo.aktualni_uzivatel() is not null
  throw 60000, N'2: aktualni_uzivatel() bez kontextu má být NULL', 1;
declare @osoba uniqueidentifier = newid();
exec sys.sp_set_session_context @key = N'osoba_id', @value = @osoba;
if dbo.aktualni_uzivatel() <> @osoba
  throw 60000, N'2: aktualni_uzivatel() nevrací id z kontextu', 1;
exec sys.sp_set_session_context @key = N'osoba_id', @value = N'tohle není uuid';
if dbo.aktualni_uzivatel() is not null
  throw 60000, N'2: nesmysl v kontextu má dát NULL, ne chybu', 1;
exec sys.sp_set_session_context @key = N'osoba_id', @value = null;
if dbo.dnes() is null or datediff(day, dbo.dnes(), cast(sysutcdatetime() as date)) not between -1 and 1
  throw 60000, N'2: dnes() nedává dnešní datum', 1;
print N'2. šev identity a dnes()';
GO

-- 3. Tvarové funkce JSON - stejná pravidla jako immutable funkce v PostgreSQL.
if dbo.je_platne_schema_parametru(null) <> 1 throw 60000, N'3: NULL schéma má být platné', 1;
if dbo.je_platne_schema_parametru(N'{}') <> 1 throw 60000, N'3: prázdný objekt má být platný', 1;
if dbo.je_platne_schema_parametru(N'{"otacky":{"typ":"cislo","jednotka":"1/min"},"chl":{"typ":"vyber","moznosti":["a","b"]}}') <> 1
  throw 60000, N'3: platné schéma odmítnuto', 1;
if dbo.je_platne_schema_parametru(N'[]') <> 0 throw 60000, N'3: pole není schéma', 1;
if dbo.je_platne_schema_parametru(N'{"x":{"typ":"spatne"}}') <> 0 throw 60000, N'3: neznámý typ prošel', 1;
if dbo.je_platne_schema_parametru(N'{"x":{"typ":"vyber","moznosti":[]}}') <> 0 throw 60000, N'3: výběr bez možností prošel', 1;
if dbo.je_platne_schema_parametru(N'{"x":{"typ":"vyber"}}') <> 0 throw 60000, N'3: výběr bez klíče moznosti prošel', 1;
if dbo.je_platne_schema_parametru(N'{"x":"text"}') <> 0 throw 60000, N'3: hodnota není objekt, přesto prošla', 1;
if dbo.je_platne_schema_parametru(N'{rozbity') <> 0 throw 60000, N'3: rozbitý JSON prošel', 1;

if dbo.jsou_platne_kontrolni_body(N'[]') <> 1 throw 60000, N'3: prázdné pole bodů má být platné', 1;
if dbo.jsou_platne_kontrolni_body(N'[{"nazev":"1000 ot.","typ":"hodnota"},{"nazev":"Kryt","typ":"ano_ne"}]') <> 1
  throw 60000, N'3: platné body odmítnuty', 1;
if dbo.jsou_platne_kontrolni_body(N'["jen text"]') <> 0 throw 60000, N'3: pole textů prošlo', 1;
if dbo.jsou_platne_kontrolni_body(N'[{"nazev":"  ","typ":"ano_ne"}]') <> 0 throw 60000, N'3: prázdný název prošel', 1;
if dbo.jsou_platne_kontrolni_body(N'[{"nazev":"x","typ":"mozna"}]') <> 0 throw 60000, N'3: neznámý typ bodu prošel', 1;

if dbo.jsou_platne_odpovedi_bodu(N'[{"nazev":"a","typ":"hodnota","hodnota":4.2},{"nazev":"b","typ":"ano_ne","ano":true}]') <> 1
  throw 60000, N'3: platné odpovědi odmítnuty', 1;
if dbo.jsou_platne_odpovedi_bodu(N'[{"nazev":"a","typ":"hodnota"},{"nazev":"b","typ":"ano_ne","ano":null}]') <> 1
  throw 60000, N'3: nezodpovězené body mají být platné', 1;
if dbo.jsou_platne_odpovedi_bodu(N'[{"nazev":"a","typ":"hodnota","hodnota":"text"}]') <> 0 throw 60000, N'3: textová hodnota prošla', 1;
if dbo.jsou_platne_odpovedi_bodu(N'[{"nazev":"a","typ":"hodnota","ano":true}]') <> 0 throw 60000, N'3: klíč ano u hodnoty prošel', 1;
if dbo.jsou_platne_odpovedi_bodu(N'[{"nazev":"b","typ":"ano_ne","ano":1}]') <> 0 throw 60000, N'3: číslo místo ano/ne prošlo', 1;
if dbo.jsou_platne_odpovedi_bodu(N'[{"nazev":"b","typ":"ano_ne","hodnota":1}]') <> 0 throw 60000, N'3: klíč hodnota u ano_ne prošel', 1;

if dbo.zadani_kontrolnich_bodu(null) <> N'[]' throw 60000, N'3: zadání z NULL má být []', 1;
if dbo.zadani_kontrolnich_bodu(N'[{"nazev":"a","typ":"hodnota","hodnota":4.2},{"nazev":"b \"c\"","typ":"ano_ne","ano":true}]')
   <> N'[{"nazev":"a","typ":"hodnota"},{"nazev":"b \"c\"","typ":"ano_ne"}]'
  throw 60000, N'3: zadání bodů neodpovídá (pořadí, odpovědi, escapování)', 1;
print N'3. tvarové funkce JSON';
GO

-- 4. Výčtový CHECK a JSON CHECK na tabulce (chyba 547 s názvem omezení).
declare @oblast uniqueidentifier = (select id from dbo.oblast where kod = N'cnc');
declare @typ uniqueidentifier = (select id from dbo.typ_zarizeni where kod = N'frezka');
if @oblast is null or @typ is null throw 60000, N'4: chybí seed (oblast cnc, typ frezka)', 1;

begin tran;
begin try
  insert into dbo.zarizeni (oblast_id, typ_zarizeni_id, nazev, stav) values (@oblast, @typ, N'Test', N'neexistuje');
  throw 60000, N'4: neznámý stav zařízení prošel CHECKem', 1;
end try
begin catch
  if error_number() = 60000 throw;
  if error_number() <> 547 or error_message() not like N'%ck_zarizeni_stav%'
    throw 60000, N'4: očekávána chyba 547 s ck_zarizeni_stav', 1;
end catch;
begin try
  update dbo.typ_zarizeni set schema_parametru = N'{"x":{"typ":"spatne"}}' where id = @typ;
  throw 60000, N'4: špatné schéma parametrů prošlo CHECKem', 1;
end try
begin catch
  if error_number() = 60000 throw;
  if error_number() <> 547 or error_message() not like N'%ck_typ_zarizeni_schema_ma_platny_tvar%'
    throw 60000, N'4: očekávána chyba 547 s ck_typ_zarizeni_schema_ma_platny_tvar', 1;
end catch;
update dbo.typ_zarizeni set schema_parametru = N'{"otacky":{"typ":"cislo","popisek":"Otáčky"}}' where id = @typ;
rollback;
print N'4. CHECK na výčet a JSON';
GO

-- 5. Filtrované unikáty: dva lidé bez osobního čísla ano, stejný e-mail
--    v jiné velikosti písmen ne (kolace), dvě aktivní karty s jedním číslem ne.
begin tran;
insert into dbo.profil (jmeno, prijmeni) values (N'Bez', N'Čísla 1'), (N'Bez', N'Čísla 2');
declare @a uniqueidentifier = newid(), @b uniqueidentifier = newid();
insert into dbo.profil (id, jmeno, prijmeni, email) values (@a, N'A', N'A', N'Test.Unikat@senco.test');
begin try
  insert into dbo.profil (id, jmeno, prijmeni, email) values (@b, N'B', N'B', N'test.unikat@SENCO.test');
  throw 60000, N'5: stejný e-mail v jiné velikosti písmen prošel', 1;
end try
begin catch
  if error_number() = 60000 throw;
  if error_number() <> 2601 or error_message() not like N'%profil_email_idx%'
    throw 60000, N'5: očekávána chyba 2601 s profil_email_idx', 1;
end catch;
insert into dbo.karta (profil_id, cislo) values (@a, N'TEST-KARTA-1');
begin try
  insert into dbo.karta (profil_id, cislo) values (@a, N'TEST-KARTA-1');
  throw 60000, N'5: druhá aktivní karta se stejným číslem prošla', 1;
end try
begin catch
  if error_number() = 60000 throw;
  if error_number() <> 2601 or error_message() not like N'%karta_cislo_idx%'
    throw 60000, N'5: očekávána chyba 2601 s karta_cislo_idx', 1;
end catch;
update dbo.karta set aktivni = 0 where profil_id = @a;
insert into dbo.karta (profil_id, cislo) values (@a, N'TEST-KARTA-1');
if (select count(*) from dbo.karta where cislo = N'TEST-KARTA-1') <> 2
  throw 60000, N'5: po vyřazení má jít stejné číslo vydat znovu', 1;
rollback;
print N'5. filtrované unikáty a kolace';
GO

-- 6. Jediný návrh a jediná aktivní verze na šablonu.
declare @oblast uniqueidentifier = (select id from dbo.oblast where kod = N'cnc');
begin tran;
declare @sablona uniqueidentifier = newid();
insert into dbo.sablona (id, oblast_id, kod, nazev) values (@sablona, @oblast, N'test_schema', N'Test');
insert into dbo.sablona_verze (sablona_id, cislo_verze, stav) values (@sablona, 1, N'navrh');
begin try
  insert into dbo.sablona_verze (sablona_id, cislo_verze, stav) values (@sablona, 2, N'navrh');
  throw 60000, N'6: druhý návrh téže šablony prošel', 1;
end try
begin catch
  if error_number() = 60000 throw;
  if error_number() <> 2601 or error_message() not like N'%sablona_verze_jediny_navrh%'
    throw 60000, N'6: očekávána chyba 2601 se sablona_verze_jediny_navrh', 1;
end catch;
begin try
  insert into dbo.sablona_verze (sablona_id, cislo_verze, stav) values (@sablona, 3, N'aktivni');
  throw 60000, N'6: aktivní verze bez platna_od prošla', 1;
end try
begin catch
  if error_number() = 60000 throw;
  if error_number() <> 547 or error_message() not like N'%ck_sablona_verze_platnost_jen_po_aktivaci%'
    throw 60000, N'6: očekávána chyba 547 s ck_sablona_verze_platnost_jen_po_aktivaci', 1;
end catch;
rollback;
print N'6. verze šablony';
GO

-- 7. Složený klíč: stroj s typem z jiné oblasti neprojde.
declare @strojni uniqueidentifier = (select id from dbo.oblast where kod = N'strojni');
declare @typ uniqueidentifier = (select id from dbo.typ_zarizeni where kod = N'frezka');
begin tran;
begin try
  insert into dbo.zarizeni (oblast_id, typ_zarizeni_id, nazev) values (@strojni, @typ, N'Frézka ve strojní');
  throw 60000, N'7: typ z cizí oblasti prošel', 1;
end try
begin catch
  if error_number() = 60000 throw;
  if error_number() <> 547 or error_message() not like N'%zarizeni_typ_ze_stejne_oblasti%'
    throw 60000, N'7: očekávána chyba 547 se zarizeni_typ_ze_stejne_oblasti', 1;
end catch;
rollback;
print N'7. typ a stroj ve stejné oblasti';
GO

print N'Test schema prošel.';
