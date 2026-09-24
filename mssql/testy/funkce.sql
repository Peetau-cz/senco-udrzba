-- =============================================================================
-- Test funkcí (0002): dalsi_termin a pomocné funkce oprávnění.
--
-- Úmluva (scripts/mssql-testy.mjs): autocommit jako vlastník databáze,
-- neúspěch = THROW 60000, průběh PRINT. Vyžaduje celý seed včetně osob
-- (admin@, cnc@, udrzbar@, management@, vedouci@, elektro@senco.test).
-- Případy dalsi_termin jsou převzaté ze supabase/tests/planovac.sql (1-7).
-- =============================================================================
set nocount on;

-- 1. dalsi_termin -------------------------------------------------------------
if dbo.dalsi_termin('2026-09-01', '2026-09-01', N'tydny', 1, N'od_planu') <> '2026-09-08'
  throw 60000, N'1: týdenní úkon udělaný v termínu nevyšel na 8. 9.', 1;
-- Plán 1. 9., hotovo 20. 9.: mřížka 8., 15., 22. - první termín po provedení.
if dbo.dalsi_termin('2026-09-01', '2026-09-20', N'tydny', 1, N'od_planu') <> '2026-09-22'
  throw 60000, N'1: zpožděný týdenní úkon nevyšel na 22. 9. - mřížka se rozpadla', 1;
if dbo.dalsi_termin('2026-09-08', '2026-09-01', N'tydny', 1, N'od_planu') <> '2026-09-15'
  throw 60000, N'1: předčasně udělaný úkon posunul mřížku', 1;
if dbo.dalsi_termin('2026-09-01', '2026-09-20', N'tydny', 1, N'od_provedeni') <> '2026-09-27'
  throw 60000, N'1: od_provedeni se nepočítalo od data provedení', 1;
if dbo.dalsi_termin('2026-09-01', null, N'dny', 10, N'od_provedeni') <> '2026-09-11'
  throw 60000, N'1: od_provedeni bez provedení se má opřít o plán', 1;
if dbo.dalsi_termin('2026-01-15', '2026-01-15', N'mesice', 3, N'od_planu') <> '2026-04-15'
  throw 60000, N'1: čtvrtletní interval nevyšel na 15. 4.', 1;
if dbo.dalsi_termin('2026-01-31', '2026-01-31', N'mesice', 1, N'od_planu') <> '2026-02-28'
  throw 60000, N'1: měsíční interval z 31. 1. nevyšel na 28. 2.', 1;
-- Krátký měsíc přitáhne a další krok už stojí na 28. (jako v PostgreSQL).
if dbo.dalsi_termin('2026-01-31', '2026-03-01', N'mesice', 1, N'od_planu') <> '2026-03-28'
  throw 60000, N'1: po krátkém měsíci má mřížka zůstat na 28.', 1;
if dbo.dalsi_termin('2024-02-29', '2024-02-29', N'roky', 1, N'od_planu') <> '2025-02-28'
  throw 60000, N'1: roční interval z 29. 2. nevyšel na 28. 2.', 1;
if dbo.dalsi_termin('2026-09-01', '2026-09-01', N'dny', 0, N'od_planu') is not null
  throw 60000, N'1: nulový interval má dát NULL', 1;
if dbo.dalsi_termin('2026-09-01', '2026-09-01', N'hodiny', 1, N'od_planu') is not null
  throw 60000, N'1: neznámý typ intervalu má dát NULL', 1;
print N'1. dalsi_termin';
GO

-- 2. Bez přihlášení nesmí nikdo nic ------------------------------------------
exec sys.sp_set_session_context @key = N'osoba_id', @value = null;
declare @cnc uniqueidentifier = (select id from dbo.oblast where kod = N'cnc');
if dbo.ma_roli(N'administrator') <> 0 or dbo.muze_zapisovat() <> 0
   or dbo.ma_pristup_k_oblasti(@cnc) <> 0 or dbo.provadi_udrzbu_v_oblasti(@cnc) <> 0
   or dbo.spravuje_zarizeni_v_oblasti(@cnc) <> 0 or dbo.spravuje_ciselniky() <> 0
  throw 60000, N'2: bez kontextu identity nějaká funkce pustila', 1;
print N'2. bez přihlášení nic';
GO

-- 3. Matice oprávnění po rolích ----------------------------------------------
declare @cnc uniqueidentifier = (select id from dbo.oblast where kod = N'cnc');
declare @strojni uniqueidentifier = (select id from dbo.oblast where kod = N'strojni');
declare @lakovna uniqueidentifier = (select id from dbo.oblast where kod = N'lakovna');
declare @osoba uniqueidentifier;
if @cnc is null or @strojni is null or @lakovna is null
  throw 60000, N'3: chybí seed oblastí', 1;

-- Administrátor: všude a všechno.
set @osoba = (select id from dbo.profil where email = N'admin@senco.test');
if @osoba is null throw 60000, N'3: chybí seed osob (npm run mssql:seed)', 1;
exec sys.sp_set_session_context @key = N'osoba_id', @value = @osoba;
if dbo.ma_roli(N'administrator') <> 1 or dbo.spravuje_ciselniky() <> 1
   or dbo.ma_pristup_k_oblasti(@strojni) <> 1 or dbo.spravuje_zarizeni_v_oblasti(@strojni) <> 1
  throw 60000, N'3: administrátor nemá plná práva', 1;

-- Specialista CNC: garant CNC, spravuje jen CNC, do strojní nevidí.
set @osoba = (select id from dbo.profil where email = N'cnc@senco.test');
exec sys.sp_set_session_context @key = N'osoba_id', @value = @osoba;
if dbo.je_garantem_oblasti(@cnc) <> 1 or dbo.spravuje_zarizeni_v_oblasti(@cnc) <> 1
   or dbo.spravuje_sablony_v_oblasti(@cnc) <> 1
  throw 60000, N'3: specialista CNC nespravuje svou oblast', 1;
if dbo.ma_pristup_k_oblasti(@strojni) <> 0 or dbo.spravuje_zarizeni_v_oblasti(@strojni) <> 0
   or dbo.spravuje_ciselniky() <> 0
  throw 60000, N'3: specialista CNC sahá mimo svou oblast', 1;

-- Údržbář: garant strojní, ale evidenci nespravuje - jen provádí údržbu
-- (strojní i lakovna, kde spolupracuje), do CNC ne.
set @osoba = (select id from dbo.profil where email = N'udrzbar@senco.test');
exec sys.sp_set_session_context @key = N'osoba_id', @value = @osoba;
if dbo.je_garantem_oblasti(@strojni) <> 1 or dbo.spravuje_zarizeni_v_oblasti(@strojni) <> 0
  throw 60000, N'3: údržbář jako garant strojní nesmí spravovat evidenci', 1;
if dbo.provadi_udrzbu_v_oblasti(@strojni) <> 1 or dbo.provadi_udrzbu_v_oblasti(@lakovna) <> 1
  throw 60000, N'3: údržbář neprovádí údržbu ve svých oblastech', 1;
if dbo.provadi_udrzbu_v_oblasti(@cnc) <> 0
  throw 60000, N'3: údržbář provádí údržbu v cizí oblasti', 1;

-- Management: vidí všechno, zapisovat nesmí nic.
set @osoba = (select id from dbo.profil where email = N'management@senco.test');
exec sys.sp_set_session_context @key = N'osoba_id', @value = @osoba;
if dbo.ma_pristup_k_oblasti(@cnc) <> 1
  throw 60000, N'3: management nevidí všechny oblasti', 1;
if dbo.muze_zapisovat() <> 0 or dbo.provadi_udrzbu_v_oblasti(@cnc) <> 0
   or dbo.spravuje_zarizeni_v_oblasti(@cnc) <> 0
  throw 60000, N'3: management smí zapisovat', 1;

exec sys.sp_set_session_context @key = N'osoba_id', @value = null;
print N'3. matice oprávnění po rolích';
GO

-- 4. Okno na opravu zápisu v deníku ------------------------------------------
-- Triggery (0003) by vytvoreno_at přepsaly, proto se na dobu testu vypnou;
-- rollback je zapne zpátky.
declare @cnc uniqueidentifier = (select id from dbo.oblast where kod = N'cnc');
declare @stroj uniqueidentifier = (select top (1) id from dbo.zarizeni where oblast_id = @cnc order by nazev);
declare @druh uniqueidentifier = (select id from dbo.druh_zasahu where kod = N'cisteni');
declare @autor uniqueidentifier = (select id from dbo.profil where email = N'cnc@senco.test');
declare @vedouci uniqueidentifier = (select id from dbo.profil where email = N'vedouci@senco.test');
declare @cizi uniqueidentifier = (select id from dbo.profil where email = N'elektro@senco.test');
declare @cerstvy uniqueidentifier = newid(), @stary uniqueidentifier = newid();
if @stroj is null or @druh is null or @autor is null
  throw 60000, N'4: chybí seed (stroj CNC, druh cisteni, osoba cnc@)', 1;

begin tran;
alter table dbo.provozni_denik disable trigger all;
insert into dbo.provozni_denik (id, zarizeni_id, oblast_id, druh_zasahu_id, popis, provedl_id, zapsal_id, vytvoreno_at)
values
  (@cerstvy, @stroj, @cnc, @druh, N'Test čerstvý', @autor, @autor, dateadd(hour, -23, sysutcdatetime())),
  (@stary,   @stroj, @cnc, @druh, N'Test starý',   @autor, @autor, dateadd(hour, -25, sysutcdatetime()));

exec sys.sp_set_session_context @key = N'osoba_id', @value = @autor;
if dbo.muze_menit_zapis_deniku(@cerstvy) <> 1
  begin rollback; throw 60000, N'4: autor nesmí opravit svůj zápis do 24 h', 1; end;
if dbo.muze_menit_zapis_deniku(@stary) <> 0
  begin rollback; throw 60000, N'4: autor smí opravit zápis starší 24 h', 1; end;
if dbo.muze_menit_zapis_deniku(newid()) <> 0
  begin rollback; throw 60000, N'4: neexistující zápis prošel', 1; end;

exec sys.sp_set_session_context @key = N'osoba_id', @value = @vedouci;
if dbo.muze_menit_zapis_deniku(@stary) <> 1
  begin rollback; throw 60000, N'4: vedoucí údržby nesmí opravit starý zápis', 1; end;

exec sys.sp_set_session_context @key = N'osoba_id', @value = @cizi;
if dbo.muze_menit_zapis_deniku(@cerstvy) <> 0
  begin rollback; throw 60000, N'4: osoba bez přístupu k oblasti smí měnit cizí zápis', 1; end;

exec sys.sp_set_session_context @key = N'osoba_id', @value = null;
rollback;
print N'4. okno na opravu zápisu v deníku';
GO

print N'Test funkce prošel.';
