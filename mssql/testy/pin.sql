-- =============================================================================
-- Test tabletu a PINu (0001 tablet/pin, 0002 funkce PINu, 0004 procedury).
-- Rozhodnutí 25. 9. 2026: dílna se na registrovaném tabletu vybere ze seznamu
-- a potvrdí PINem; 5 chyb = 15 minut, 10 chyb = natrvalo do odemčení.
--
-- Úmluva (scripts/mssql-testy.mjs): autocommit jako vlastník databáze,
-- neúspěch = THROW 60000, průběh PRINT. Očekávané chyby v TRY/CATCH. Uklidí
-- spouštěč. Vyžaduje seed osob (Karel Zámečník 2001, management@).
-- =============================================================================
set nocount on;

-- 1. Pravidla PINu ------------------------------------------------------------
if dbo.je_platny_pin(N'4815') <> 1 or dbo.je_platny_pin(N'481516') <> 1
  throw 60000, N'1: platný PIN odmítnut', 1;
if dbo.je_platny_pin(N'123') <> 0 or dbo.je_platny_pin(N'1234567') <> 0
   or dbo.je_platny_pin(N'12a4') <> 0 or dbo.je_platny_pin(N'4815 ') <> 0 or dbo.je_platny_pin(null) <> 0
  throw 60000, N'1: neplatný PIN (délka, písmena, mezera, NULL) prošel', 1;
if dbo.je_slaby_pin(N'0000') <> 1 or dbo.je_slaby_pin(N'777777') <> 1
   or dbo.je_slaby_pin(N'1234') <> 1 or dbo.je_slaby_pin(N'98765') <> 1 or dbo.je_slaby_pin(N'3456') <> 1
  throw 60000, N'1: slabý PIN (stejné číslice, řada) nebyl poznán', 1;
if dbo.je_slaby_pin(N'4815') <> 0 or dbo.je_slaby_pin(N'2580') <> 0
  throw 60000, N'1: rozumný PIN označen za slabý', 1;
if dbo.hash_pinu(0x00112233445566778899AABBCCDDEEFF, N'4815') = dbo.hash_pinu(0xFF112233445566778899AABBCCDDEEFF, N'4815')
  throw 60000, N'1: jiná sůl dala stejný hash', 1;
print N'1. pravidla PINu';
GO

-- 2. Registrace tabletu a seznam jmen -----------------------------------------
declare @token binary(32) = hashbytes('SHA2_256', N'tablet-test-token');
declare @karel uniqueidentifier = (select id from dbo.profil where osobni_cislo = 2001);
declare @vysledek table (id uniqueidentifier);
declare @jmena table (id uniqueidentifier, jmeno nvarchar(100), prijmeni nvarchar(100));
if @karel is null throw 60000, N'2: chybí seed osoby 2001 (Karel Zámečník)', 1;

exec dbo.nastav_pin @osoba = @karel, @pin = N'4815';
update dbo.pin set musi_zmenit = 0 where profil_id = @karel;

begin try
  insert into @jmena exec dbo.seznam_pro_tablet @token_hash = @token;
  throw 60000, N'2: neregistrovaný tablet dostal seznam jmen', 1;
end try
begin catch
  if error_number() <> 50021 throw 60000, N'2: neregistrovaný tablet - čekána chyba 50021', 1;
end catch;

insert into @vysledek exec dbo.zaregistruj_tablet @nazev = N'Test hala', @token_hash = @token;
if (select count(*) from dbo.tablet where token_hash = @token and aktivni = 1) <> 1
  throw 60000, N'2: tablet se nezaregistroval', 1;
if not exists (select 1 from dbo.audit_log where tabulka = N'tablet' and operace = N'INSERT'
               and zaznam_id = lower(cast((select id from @vysledek) as nchar(36))))
  throw 60000, N'2: registrace tabletu není v auditu', 1;

insert into @jmena exec dbo.seznam_pro_tablet @token_hash = @token;
if not exists (select 1 from @jmena where id = @karel)
  throw 60000, N'2: osoba s rolí a PINem chybí v seznamu tabletu', 1;
if exists (select 1 from @jmena j join dbo.profil p on p.id = j.id where p.email = N'management@senco.test')
  throw 60000, N'2: osoba bez PINu je v seznamu tabletu', 1;
print N'2. registrace tabletu a seznam jmen';
GO

-- 3. Přihlášení a zámek -------------------------------------------------------
declare @token binary(32) = hashbytes('SHA2_256', N'tablet-test-token');
declare @karel uniqueidentifier = (select id from dbo.profil where osobni_cislo = 2001);
declare @r table (vysledek nvarchar(20), tablet_id uniqueidentifier, musi_zmenit bit, zamceno_do datetime2(3));
declare @i int;

insert into @r exec dbo.prihlas_pinem @token_hash = @token, @osoba = @karel, @pin = N'4815';
if (select vysledek + N'|' + cast(musi_zmenit as nvarchar(1)) from @r) <> N'ok|0'
  throw 60000, N'3: správný PIN nepřihlásil', 1;
if (select tablet_id from @r) <> (select id from dbo.tablet where token_hash = @token)
  throw 60000, N'3: přihlášení nevrátilo id tabletu', 1;

-- Čtyři chyby, pátá zamkne na 15 minut; pak nepustí ani správný PIN.
set @i = 1;
while @i <= 4
begin
  delete from @r;
  insert into @r exec dbo.prihlas_pinem @token_hash = @token, @osoba = @karel, @pin = N'1111';
  if (select vysledek from @r) <> N'spatny_pin' throw 60000, N'3: špatný PIN nevrátil spatny_pin', 1;
  set @i += 1;
end;
delete from @r;
insert into @r exec dbo.prihlas_pinem @token_hash = @token, @osoba = @karel, @pin = N'abc';
if (select vysledek from @r) <> N'zamceno' or (select zamceno_do from @r) < dateadd(minute, 14, sysutcdatetime())
  throw 60000, N'3: pátá chyba (i nesmyslný vstup) nezamkla na 15 minut', 1;
delete from @r;
insert into @r exec dbo.prihlas_pinem @token_hash = @token, @osoba = @karel, @pin = N'4815';
if (select vysledek from @r) <> N'zamceno' throw 60000, N'3: zamčená osoba se přihlásila správným PINem', 1;
if not exists (select 1 from dbo.audit_log where tabulka = N'pin' and json_value(novy_stav, N'$.udalost') = N'zamceno')
  throw 60000, N'3: zamčení není v auditu', 1;

-- Zámek vyprší; dalších pět chyb (celkem 10) zamkne natrvalo.
update dbo.pin set zamceno_do = dateadd(minute, -1, sysutcdatetime()) where profil_id = @karel;
set @i = 1;
while @i <= 5
begin
  delete from @r;
  insert into @r exec dbo.prihlas_pinem @token_hash = @token, @osoba = @karel, @pin = N'1111';
  set @i += 1;
end;
if (select vysledek from @r) <> N'zamceno_trvale' throw 60000, N'3: desátá chyba nezamkla natrvalo', 1;
delete from @r;
insert into @r exec dbo.prihlas_pinem @token_hash = @token, @osoba = @karel, @pin = N'4815';
if (select vysledek from @r) <> N'zamceno_trvale' throw 60000, N'3: trvale zamčená osoba se přihlásila', 1;

-- Odemčení adminem: správný PIN zase projde a počítadlo je na nule.
exec dbo.odemkni_pin @osoba = @karel;
delete from @r;
insert into @r exec dbo.prihlas_pinem @token_hash = @token, @osoba = @karel, @pin = N'4815';
if (select vysledek from @r) <> N'ok' or (select chyb from dbo.pin where profil_id = @karel) <> 0
  throw 60000, N'3: po odemčení správný PIN nepřihlásil nebo nevynuloval chyby', 1;

-- Osoba bez role a osoba bez PINu.
delete from @r;
insert into @r exec dbo.prihlas_pinem @token_hash = @token, @osoba = '00000000-0000-0000-0000-0000000000ff', @pin = N'4815';
if (select vysledek from @r) <> N'neznama_osoba' throw 60000, N'3: neznámá osoba nevrátila neznama_osoba', 1;
declare @management uniqueidentifier = (select id from dbo.profil where email = N'management@senco.test');
delete from @r;
insert into @r exec dbo.prihlas_pinem @token_hash = @token, @osoba = @management, @pin = N'4815';
if (select vysledek from @r) <> N'bez_pinu' throw 60000, N'3: osoba bez PINu nevrátila bez_pinu', 1;
print N'3. přihlášení a zámek';
GO

-- 4. Dočasný PIN od admina a vlastní změna ------------------------------------
declare @token binary(32) = hashbytes('SHA2_256', N'tablet-test-token');
declare @karel uniqueidentifier = (select id from dbo.profil where osobni_cislo = 2001);
declare @r table (vysledek nvarchar(20), tablet_id uniqueidentifier, musi_zmenit bit, zamceno_do datetime2(3));
declare @z table (vysledek nvarchar(20), zamceno_do datetime2(3));

begin try
  exec dbo.nastav_pin @osoba = @karel, @pin = N'1234';
  throw 60000, N'4: slabý PIN prošel', 1;
end try
begin catch
  if error_number() <> 50305 throw 60000, N'4: slabý PIN - čekána chyba 50305', 1;
end catch;
begin try
  exec dbo.nastav_pin @osoba = @karel, @pin = N'12';
  throw 60000, N'4: krátký PIN prošel', 1;
end try
begin catch
  if error_number() <> 50304 throw 60000, N'4: krátký PIN - čekána chyba 50304', 1;
end catch;

exec dbo.nastav_pin @osoba = @karel, @pin = N'9173';
if (select relace_platne_od from dbo.profil where id = @karel) is null
  throw 60000, N'4: nový PIN nezneplatnil dřívější přihlášení', 1;
insert into @r exec dbo.prihlas_pinem @token_hash = @token, @osoba = @karel, @pin = N'9173';
if (select vysledek + N'|' + cast(musi_zmenit as nvarchar(1)) from @r) <> N'ok|1'
  throw 60000, N'4: dočasný PIN nevyžaduje změnu', 1;

exec sys.sp_set_session_context @key = N'osoba_id', @value = @karel;
begin try
  exec dbo.zmen_pin @stary = N'9173', @novy = N'5555';
  throw 60000, N'4: změna na slabý PIN prošla', 1;
end try
begin catch
  if error_number() <> 50305 throw 60000, N'4: změna na slabý PIN - čekána chyba 50305', 1;
end catch;
begin try
  exec dbo.zmen_pin @stary = N'9173', @novy = N'9173';
  throw 60000, N'4: změna na stejný PIN prošla', 1;
end try
begin catch
  if error_number() <> 50306 throw 60000, N'4: stejný PIN - čekána chyba 50306', 1;
end catch;

insert into @z exec dbo.zmen_pin @stary = N'0426', @novy = N'6042';
if (select vysledek from @z) <> N'spatny_pin' throw 60000, N'4: změna se špatným starým PINem nevrátila spatny_pin', 1;
if (select chyb from dbo.pin where profil_id = @karel) <> 1
  throw 60000, N'4: špatný starý PIN se nezapočítal do chyb', 1;

delete from @z;
insert into @z exec dbo.zmen_pin @stary = N'9173', @novy = N'6042';
if (select vysledek from @z) <> N'ok' or (select musi_zmenit from dbo.pin where profil_id = @karel) <> 0
  throw 60000, N'4: změna PINu neprošla nebo nezrušila povinnost změny', 1;
exec sys.sp_set_session_context @key = N'osoba_id', @value = null;

delete from @r;
insert into @r exec dbo.prihlas_pinem @token_hash = @token, @osoba = @karel, @pin = N'6042';
if (select vysledek from @r) <> N'ok' throw 60000, N'4: nový PIN nepřihlásil', 1;
delete from @r;
insert into @r exec dbo.prihlas_pinem @token_hash = @token, @osoba = @karel, @pin = N'9173';
if (select vysledek from @r) <> N'spatny_pin' throw 60000, N'4: starý PIN po změně pořád platí', 1;

begin try
  exec dbo.zmen_pin @stary = N'6042', @novy = N'7391';
  throw 60000, N'4: změna PINu bez přihlášení prošla', 1;
end try
begin catch
  if error_number() <> 50016 throw 60000, N'4: změna bez přihlášení - čekána chyba 50016', 1;
end catch;
print N'4. dočasný PIN a vlastní změna';
GO

-- 5. Zrušený tablet -----------------------------------------------------------
declare @token binary(32) = hashbytes('SHA2_256', N'tablet-test-token');
declare @tablet uniqueidentifier = (select id from dbo.tablet where token_hash = @token);
declare @karel uniqueidentifier = (select id from dbo.profil where osobni_cislo = 2001);
exec dbo.zrus_tablet @id = @tablet;
begin try
  exec dbo.prihlas_pinem @token_hash = @token, @osoba = @karel, @pin = N'6042';
  throw 60000, N'5: přihlášení na zrušeném tabletu prošlo', 1;
end try
begin catch
  if error_number() <> 50021 throw 60000, N'5: zrušený tablet - čekána chyba 50021', 1;
end catch;
begin try
  exec dbo.zrus_tablet @id = @tablet;
  throw 60000, N'5: druhé zrušení prošlo', 1;
end try
begin catch
  if error_number() <> 50205 throw 60000, N'5: druhé zrušení - čekána chyba 50205', 1;
end catch;
print N'5. zrušený tablet';
GO

print N'Test pin prošel.';
