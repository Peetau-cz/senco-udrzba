-- =============================================================================
-- Test práv (0006): řádková omezení a granty pod účtem aplikace.
-- Převod supabase/tests/rls.sql, prava_zakazek.sql, grantových kontrol
-- z denik.sql a historie.sql (č. 7), plus věci, které v PostgreSQL nebyly:
-- tabulky tabletu a PINu, procedury bez EXECUTE, razítko pod RLS, kaskáda.
--
-- Úmluva (scripts/mssql-testy.mjs): fixtury jako vlastník (pevná id ...d0xx),
-- kontroly pod EXECUTE AS USER = 'udrzba_app' s osobou v SESSION_CONTEXT.
-- Zakázaný zápis: 33504 (BLOCK predikát), 229 (chybí právo na objekt),
-- 230 (chybí právo na sloupec). Řádek mimo FILTER = 0 dotčených řádků.
-- Vyžaduje celý seed včetně osob.
-- =============================================================================
set nocount on;

-- Fixtury ve strojní oblasti --------------------------------------------------
declare @strojni uniqueidentifier = (select id from dbo.oblast where kod = N'strojni');
declare @udrzbar_role uniqueidentifier = (select id from dbo.[role] where kod = N'udrzbar');
if @strojni is null or @udrzbar_role is null throw 60000, N'fixtury: chybí seed (oblast strojni, role udrzbar)', 1;

insert into dbo.typ_zarizeni (id, oblast_id, kod, nazev)
values ('00000000-0000-0000-0000-00000000d001', @strojni, N'test_prava_typ', N'Lis');
insert into dbo.zarizeni (id, oblast_id, typ_zarizeni_id, nazev)
values ('00000000-0000-0000-0000-00000000d002', @strojni, '00000000-0000-0000-0000-00000000d001', N'Lis test');
insert into dbo.sablona (id, oblast_id, kod, nazev)
values ('00000000-0000-0000-0000-00000000d003', @strojni, N'test_prava', N'Údržba lisu'),
       ('00000000-0000-0000-0000-00000000d008', @strojni, N'test_prava_navrh', N'Rozpracovaná');
insert into dbo.sablona_verze (id, sablona_id, cislo_verze)
values ('00000000-0000-0000-0000-00000000d004', '00000000-0000-0000-0000-00000000d003', 1),
       ('00000000-0000-0000-0000-00000000d009', '00000000-0000-0000-0000-00000000d008', 1);
insert into dbo.sablona_ukon (id, sablona_verze_id, poradi, nazev, interval_typ, interval_hodnota, profese_role_id)
values ('00000000-0000-0000-0000-00000000d005', '00000000-0000-0000-0000-00000000d004', 1, N'Mazání', N'tydny', 1, @udrzbar_role),
       ('00000000-0000-0000-0000-00000000d010', '00000000-0000-0000-0000-00000000d009', 1, N'Návrh', N'tydny', 1, @udrzbar_role);
update dbo.sablona_verze set stav = N'aktivni', platna_od = sysutcdatetime()
where id = '00000000-0000-0000-0000-00000000d004';
insert into dbo.zarizeni_sablona (zarizeni_id, sablona_id, oblast_id)
values ('00000000-0000-0000-0000-00000000d002', '00000000-0000-0000-0000-00000000d003', @strojni);
insert into dbo.zakazka (id, zarizeni_id, sablona_verze_id, profese_role_id, planovany_termin)
values ('00000000-0000-0000-0000-00000000d006', '00000000-0000-0000-0000-00000000d002',
        '00000000-0000-0000-0000-00000000d004', @udrzbar_role, dbo.dnes());
insert into dbo.zakazka_ukon (id, zakazka_id, poradi, nazev_snapshot, kontrolni_body)
values ('00000000-0000-0000-0000-00000000d007', '00000000-0000-0000-0000-00000000d006', 1, N'Mazání',
        N'[{"nazev":"Hladina","typ":"ano_ne"}]');
GO

-- 1. Oblasti: CNC vidí jen svou, vedoucí všechny; zápis jen správce číselníků,
--    mazání jen administrátor.
declare @cnc uniqueidentifier = (select id from dbo.profil where email = N'cnc@senco.test');
declare @vedouci uniqueidentifier = (select id from dbo.profil where email = N'vedouci@senco.test');
declare @vsech int = (select count(*) from dbo.oblast), @vidi int, @radku int;

exec sys.sp_set_session_context @key = N'osoba_id', @value = @cnc;
execute as user = N'udrzba_app';
set @vidi = (select count(*) from dbo.oblast);
begin try
  insert into dbo.oblast (kod, nazev) values (N'test_cizi', N'Cizí');
  set @radku = -1;
end try
begin catch
  set @radku = error_number();
end catch;
update dbo.oblast set nazev = nazev where kod = N'strojni';
declare @upraveno int = @@rowcount;
revert;
if @vidi <> 1 throw 60000, N'1: specialista CNC nevidí právě jednu oblast', 1;
if @radku <> 33504 throw 60000, N'1: specialista CNC založil oblast (čekáno 33504)', 1;
if @upraveno <> 0 throw 60000, N'1: specialista CNC upravil cizí oblast', 1;

exec sys.sp_set_session_context @key = N'osoba_id', @value = @vedouci;
execute as user = N'udrzba_app';
set @vidi = (select count(*) from dbo.oblast);
insert into dbo.oblast (id, kod, nazev) values ('00000000-0000-0000-0000-00000000d020', N'test_vedouci', N'Od vedoucího');
begin try
  delete from dbo.oblast where id = '00000000-0000-0000-0000-00000000d020';
  set @radku = -1;
end try
begin catch
  set @radku = error_number();
end catch;
revert;
exec sys.sp_set_session_context @key = N'osoba_id', @value = null;
if @vidi <> @vsech throw 60000, N'1: vedoucí údržby nevidí všechny oblasti', 1;
if @radku <> 33504 throw 60000, N'1: vedoucí údržby smazal oblast (smí jen administrátor, čekáno 33504)', 1;
print N'1. oblasti';
GO

-- 2. Audit a role: audit čte jen vedení; role se čtou přes pohled, tabulka
--    aplikaci nepatří.
declare @cnc uniqueidentifier = (select id from dbo.profil where email = N'cnc@senco.test');
declare @management uniqueidentifier = (select id from dbo.profil where email = N'management@senco.test');
declare @audit int, @role int, @cizi_role int, @chyba1 int = 0, @chyba2 int = 0;

exec sys.sp_set_session_context @key = N'osoba_id', @value = @cnc;
execute as user = N'udrzba_app';
set @audit = (select count(*) from dbo.audit_log);
set @role = (select count(*) from dbo.v_uzivatel_role);
set @cizi_role = (select count(*) from dbo.v_uzivatel_role where uzivatel_id <> @cnc);
begin try
  declare @x int = (select count(*) from dbo.uzivatel_role);
end try
begin catch
  set @chyba1 = error_number();
end catch;
revert;
if @audit <> 0 throw 60000, N'2: specialista CNC vidí audit', 1;
if @role < 1 or @cizi_role <> 0 throw 60000, N'2: pohled rolí neukazuje specialistovi jen jeho role', 1;
if @chyba1 <> 229 throw 60000, N'2: aplikace čte tabulku uzivatel_role napřímo (čekáno 229)', 1;

exec sys.sp_set_session_context @key = N'osoba_id', @value = @management;
execute as user = N'udrzba_app';
set @audit = (select count(*) from dbo.audit_log);
set @cizi_role = (select count(*) from dbo.v_uzivatel_role where uzivatel_id <> @management);
begin try
  delete from dbo.audit_log where id = (select max(id) from dbo.audit_log);
end try
begin catch
  set @chyba2 = error_number();
end catch;
revert;
exec sys.sp_set_session_context @key = N'osoba_id', @value = null;
if @audit = 0 throw 60000, N'2: management nevidí audit', 1;
if @cizi_role = 0 throw 60000, N'2: management nevidí role ostatních', 1;
if @chyba2 <> 229 throw 60000, N'2: management smazal auditní záznam (čekáno 229)', 1;
print N'2. audit a role';
GO

-- 3. Zařízení: garant zakládá ve své oblasti, ne v cizí; údržbář-garant
--    nezakládá vůbec; cizí oblast není vidět.
declare @cnc uniqueidentifier = (select id from dbo.profil where email = N'cnc@senco.test');
declare @udrzbar uniqueidentifier = (select id from dbo.profil where email = N'udrzbar@senco.test');
declare @cnc_oblast uniqueidentifier = (select id from dbo.oblast where kod = N'cnc');
declare @strojni uniqueidentifier = (select id from dbo.oblast where kod = N'strojni');
declare @frezka uniqueidentifier = (select id from dbo.typ_zarizeni where kod = N'frezka');
declare @chyba1 int = 0, @chyba2 int = 0, @vidi_strojni int;

exec sys.sp_set_session_context @key = N'osoba_id', @value = @cnc;
execute as user = N'udrzba_app';
insert into dbo.zarizeni (id, oblast_id, typ_zarizeni_id, nazev)
values ('00000000-0000-0000-0000-00000000d021', @cnc_oblast, @frezka, N'Frézka od garanta');
begin try
  insert into dbo.zarizeni (oblast_id, typ_zarizeni_id, nazev)
  values (@strojni, '00000000-0000-0000-0000-00000000d001', N'Do cizí oblasti');
end try
begin catch
  set @chyba1 = error_number();
end catch;
set @vidi_strojni = (select count(*) from dbo.zarizeni where oblast_id = @strojni);
revert;
if not exists (select 1 from dbo.zarizeni where id = '00000000-0000-0000-0000-00000000d021')
  throw 60000, N'3: garant CNC nezaložil stroj ve své oblasti', 1;
if @chyba1 <> 33504 throw 60000, N'3: garant CNC založil stroj v cizí oblasti (čekáno 33504)', 1;
if @vidi_strojni <> 0 throw 60000, N'3: garant CNC vidí stroje strojní oblasti', 1;

exec sys.sp_set_session_context @key = N'osoba_id', @value = @udrzbar;
execute as user = N'udrzba_app';
begin try
  insert into dbo.zarizeni (oblast_id, typ_zarizeni_id, nazev)
  values (@strojni, '00000000-0000-0000-0000-00000000d001', N'Od údržbáře');
end try
begin catch
  set @chyba2 = error_number();
end catch;
revert;
exec sys.sp_set_session_context @key = N'osoba_id', @value = null;
if @chyba2 <> 33504 throw 60000, N'3: údržbář (garant strojní bez role garanta) založil stroj (čekáno 33504)', 1;
print N'3. zařízení';
GO

-- 4. Zakázky (dřív prava_zakazek.sql): technik vyplňuje, zadání nepřepíše,
--    zakázky nezakládá ani nemaže; razítko projde pod RLS.
declare @udrzbar uniqueidentifier = (select id from dbo.profil where email = N'udrzbar@senco.test');
declare @c1 int = 0, @c2 int = 0, @c3 int = 0, @c4 int = 0, @c5 int = 0;
declare @zmeneno_pred datetime2(3) = (select zmeneno_at from dbo.zakazka where id = '00000000-0000-0000-0000-00000000d006');
waitfor delay '00:00:00.020';  -- ať se razítko po úpravě pozná od toho při založení

exec sys.sp_set_session_context @key = N'osoba_id', @value = @udrzbar;
execute as user = N'udrzba_app';
update dbo.zakazka_ukon
set stav = N'splneno', potvrzeno_at = sysutcdatetime(), potvrdil_id = @udrzbar,
    kontrolni_body = N'[{"nazev":"Hladina","typ":"ano_ne","ano":true}]'
where id = '00000000-0000-0000-0000-00000000d007';
update dbo.zakazka set stav = N'probiha', zahajeno_at = sysutcdatetime(), prirazeno_uzivateli_id = @udrzbar
where id = '00000000-0000-0000-0000-00000000d006';
begin try update dbo.zakazka_ukon set nazev_snapshot = N'Jiný' where id = '00000000-0000-0000-0000-00000000d007'; end try
begin catch set @c1 = error_number(); end catch;
begin try update dbo.zakazka set planovany_termin = '2030-01-01' where id = '00000000-0000-0000-0000-00000000d006'; end try
begin catch set @c2 = error_number(); end catch;
begin try
  insert into dbo.zakazka (zarizeni_id, sablona_verze_id, profese_role_id, planovany_termin)
  select zarizeni_id, sablona_verze_id, profese_role_id, '2030-01-02' from dbo.zakazka where id = '00000000-0000-0000-0000-00000000d006';
end try
begin catch set @c3 = error_number(); end catch;
begin try delete from dbo.zakazka_ukon where id = '00000000-0000-0000-0000-00000000d007'; end try
begin catch set @c4 = error_number(); end catch;
begin try delete from dbo.zakazka where id = '00000000-0000-0000-0000-00000000d006'; end try
begin catch set @c5 = error_number(); end catch;
insert into dbo.zakazka_foto (id, zakazka_ukon_id, storage_path)
values ('00000000-0000-0000-0000-00000000d022', '00000000-0000-0000-0000-00000000d007', N'test/d022.jpg');
delete from dbo.zakazka_foto where id = '00000000-0000-0000-0000-00000000d022';
revert;
exec sys.sp_set_session_context @key = N'osoba_id', @value = null;

if (select stav from dbo.zakazka_ukon where id = '00000000-0000-0000-0000-00000000d007') <> N'splneno'
  throw 60000, N'4: technik nevyplnil krok checklistu', 1;
if (select stav from dbo.zakazka where id = '00000000-0000-0000-0000-00000000d006') <> N'probiha'
  throw 60000, N'4: technik nezahájil zakázku', 1;
if (select zmeneno_at from dbo.zakazka where id = '00000000-0000-0000-0000-00000000d006') <= @zmeneno_pred
  throw 60000, N'4: razítko zmeneno_at pod RLS neproběhlo', 1;
if @c1 <> 230 throw 60000, N'4: technik přepsal nazev_snapshot (čekáno 230)', 1;
if @c2 <> 230 throw 60000, N'4: technik přepsal planovany_termin (čekáno 230)', 1;
if @c3 <> 229 throw 60000, N'4: technik založil zakázku (čekáno 229)', 1;
if @c4 <> 229 throw 60000, N'4: technik smazal krok (čekáno 229)', 1;
if @c5 <> 229 throw 60000, N'4: technik smazal zakázku (čekáno 229)', 1;
if exists (select 1 from dbo.zakazka_foto where id = '00000000-0000-0000-0000-00000000d022')
  throw 60000, N'4: technik nesmazal vlastní fotku kroku', 1;
print N'4. zakázky';
GO

-- 5. Plán a profil: garant zadá termín, plán ani osobu nesmaže nikdo.
declare @vedouci uniqueidentifier = (select id from dbo.profil where email = N'vedouci@senco.test');
declare @c1 int = 0, @c2 int = 0;
exec sys.sp_set_session_context @key = N'osoba_id', @value = @vedouci;
execute as user = N'udrzba_app';
update dbo.plan_udrzby set dalsi_termin = '2030-01-01' where zarizeni_id = '00000000-0000-0000-0000-00000000d002';
begin try delete from dbo.plan_udrzby where zarizeni_id = '00000000-0000-0000-0000-00000000d002'; end try
begin catch set @c1 = error_number(); end catch;
begin try delete from dbo.profil where email = N'management@senco.test'; end try
begin catch set @c2 = error_number(); end catch;
revert;
exec sys.sp_set_session_context @key = N'osoba_id', @value = null;
if not exists (select 1 from dbo.plan_udrzby where zarizeni_id = '00000000-0000-0000-0000-00000000d002' and dalsi_termin = '2030-01-01')
  throw 60000, N'5: vedoucí nezadal termín plánu', 1;
if @c1 <> 229 throw 60000, N'5: plán šel smazat (čekáno 229)', 1;
if @c2 <> 229 throw 60000, N'5: osoba šla smazat (čekáno 229)', 1;
print N'5. plán a profil';
GO

-- 6. Deník (grantové kontroly z denik.sql): zápis ve své oblasti pod svým
--    jménem, zapsal_id se nemění, nemaže se, management nezapisuje.
declare @udrzbar uniqueidentifier = (select id from dbo.profil where email = N'udrzbar@senco.test');
declare @management uniqueidentifier = (select id from dbo.profil where email = N'management@senco.test');
declare @vedouci uniqueidentifier = (select id from dbo.profil where email = N'vedouci@senco.test');
declare @strojni uniqueidentifier = (select id from dbo.oblast where kod = N'strojni');
declare @cnc_oblast uniqueidentifier = (select id from dbo.oblast where kod = N'cnc');
declare @cnc_stroj uniqueidentifier = (select top (1) id from dbo.zarizeni where oblast_id = @cnc_oblast order by nazev);
declare @druh uniqueidentifier = (select id from dbo.druh_zasahu where kod = N'cisteni');
declare @c1 int = 0, @c2 int = 0, @c3 int = 0, @c4 int = 0, @c5 int = 0;
declare @zmeneno datetime2(3);

exec sys.sp_set_session_context @key = N'osoba_id', @value = @udrzbar;
execute as user = N'udrzba_app';
insert into dbo.provozni_denik (id, zarizeni_id, oblast_id, druh_zasahu_id, popis)
values ('00000000-0000-0000-0000-00000000d023', '00000000-0000-0000-0000-00000000d002', @strojni, @druh, N'Test práv');
set @zmeneno = (select zmeneno_at from dbo.provozni_denik where id = '00000000-0000-0000-0000-00000000d023');
update dbo.provozni_denik set popis = N'Test práv, opraveno' where id = '00000000-0000-0000-0000-00000000d023';
begin try
  insert into dbo.provozni_denik (zarizeni_id, oblast_id, druh_zasahu_id, popis, zapsal_id)
  values ('00000000-0000-0000-0000-00000000d002', @strojni, @druh, N'Za cizího', @vedouci);
end try
begin catch set @c1 = error_number(); end catch;
begin try
  insert into dbo.provozni_denik (zarizeni_id, oblast_id, druh_zasahu_id, popis)
  values (@cnc_stroj, @cnc_oblast, @druh, N'Do cizí oblasti');
end try
begin catch set @c2 = error_number(); end catch;
begin try update dbo.provozni_denik set zapsal_id = @vedouci where id = '00000000-0000-0000-0000-00000000d023'; end try
begin catch set @c3 = error_number(); end catch;
begin try delete from dbo.provozni_denik where id = '00000000-0000-0000-0000-00000000d023'; end try
begin catch set @c4 = error_number(); end catch;
revert;

exec sys.sp_set_session_context @key = N'osoba_id', @value = @management;
execute as user = N'udrzba_app';
begin try
  insert into dbo.provozni_denik (zarizeni_id, oblast_id, druh_zasahu_id, popis)
  values ('00000000-0000-0000-0000-00000000d002', @strojni, @druh, N'Od managementu');
end try
begin catch set @c5 = error_number(); end catch;
revert;
exec sys.sp_set_session_context @key = N'osoba_id', @value = null;

if (select zapsal_id from dbo.provozni_denik where id = '00000000-0000-0000-0000-00000000d023') <> @udrzbar
  throw 60000, N'6: zápis nemá zapsal_id přihlášeného', 1;
if (select zmeneno_at from dbo.provozni_denik where id = '00000000-0000-0000-0000-00000000d023') < @zmeneno
   or (select popis from dbo.provozni_denik where id = '00000000-0000-0000-0000-00000000d023') <> N'Test práv, opraveno'
  throw 60000, N'6: autor neopravil vlastní zápis (nebo neproběhlo razítko)', 1;
if @c1 <> 33504 throw 60000, N'6: zápis za cizího prošel (čekáno 33504)', 1;
if @c2 <> 33504 throw 60000, N'6: zápis do cizí oblasti prošel (čekáno 33504)', 1;
if @c3 <> 230 throw 60000, N'6: zapsal_id šlo změnit (čekáno 230)', 1;
if @c4 <> 229 throw 60000, N'6: zápis šel smazat (čekáno 229)', 1;
if @c5 <> 33504 throw 60000, N'6: management zapsal do deníku (čekáno 33504)', 1;
print N'6. deník';
GO

-- 7. Pohled historie nepřenese cizí oblast (historie.sql č. 7).
declare @cnc uniqueidentifier = (select id from dbo.profil where email = N'cnc@senco.test');
declare @vidi int;
exec sys.sp_set_session_context @key = N'osoba_id', @value = @cnc;
execute as user = N'udrzba_app';
set @vidi = (select count(*) from dbo.v_historie_zarizeni where zarizeni_id = '00000000-0000-0000-0000-00000000d002');
revert;
exec sys.sp_set_session_context @key = N'osoba_id', @value = null;
if @vidi <> 0 throw 60000, N'7: specialista CNC vidí přes pohled historii strojní oblasti', 1;
print N'7. historie přes pohled';
GO

-- 8. Tabulky přihlášení a procedury bez EXECUTE.
declare @c1 int = 0, @c2 int = 0, @c3 int = 0, @c4 int = 0, @c5 int = 0, @c6 int = 0, @c7 int = 0;
declare @x int, @pocet int;
execute as user = N'udrzba_app';
begin try set @x = (select count(*) from dbo.pin); end try begin catch set @c1 = error_number(); end catch;
begin try set @x = (select count(*) from dbo.tablet); end try begin catch set @c2 = error_number(); end catch;
begin try set @x = (select count(*) from dbo.prihlaseni); end try begin catch set @c3 = error_number(); end catch;
begin try set @x = (select count(*) from dbo.pokus_hesla); end try begin catch set @c4 = error_number(); end catch;
begin try exec dbo.zaloz_zakazky @okno_dnu = 14, @zarizeni = null, @pocet = @pocet output; end try
begin catch set @c5 = error_number(); end catch;
begin try exec dbo.spust_planovac; end try begin catch set @c6 = error_number(); end catch;
revert;
execute as user = N'udrzba_planovac';
begin try exec dbo.naplanuj_zarizeni @zarizeni = '00000000-0000-0000-0000-00000000d002'; end try
begin catch set @c7 = error_number(); end catch;
revert;
if @c1 <> 229 or @c2 <> 229 or @c3 <> 229 or @c4 <> 229
  throw 60000, N'8: aplikace čte tabulku pin / tablet / prihlaseni / pokus_hesla (čekáno 229)', 1;
if @c5 <> 229 throw 60000, N'8: aplikace spustila zaloz_zakazky (čekáno 229)', 1;
if @c6 <> 229 throw 60000, N'8: aplikace spustila plánovač (čekáno 229)', 1;
if @c7 <> 229 throw 60000, N'8: plánovač spustil naplanuj_zarizeni (čekáno 229)', 1;
print N'8. tabulky přihlášení a procedury';
GO

-- 9. Správa osob: role přiděluje jen administrátor; kaskáda při mazání
--    rozpracované šablony projde přes BEFORE DELETE predikáty podřízených.
declare @vedouci uniqueidentifier = (select id from dbo.profil where email = N'vedouci@senco.test');
declare @admin uniqueidentifier = (select id from dbo.profil where email = N'admin@senco.test');
declare @karel uniqueidentifier = (select id from dbo.profil where osobni_cislo = 2001);
declare @udrzbar_role nvarchar(40) = lower(cast((select id from dbo.[role] where kod = N'udrzbar') as nchar(36)));
declare @elektro_role nvarchar(40) = lower(cast((select id from dbo.[role] where kod = N'specialista_elektro') as nchar(36)));
declare @c1 int = 0, @c2 int = 0;

exec sys.sp_set_session_context @key = N'osoba_id', @value = @vedouci;
execute as user = N'udrzba_app';
begin try
  declare @role nvarchar(200) = N'["' + @udrzbar_role + N'","' + @elektro_role + N'"]';
  exec dbo.nastav_role_osoby @osoba = @karel, @role = @role;
end try
begin catch set @c1 = error_number(); end catch;
begin try delete from dbo.sablona where id = '00000000-0000-0000-0000-00000000d008'; end try
begin catch set @c2 = error_number(); end catch;
revert;

exec sys.sp_set_session_context @key = N'osoba_id', @value = @admin;
execute as user = N'udrzba_app';
declare @role2 nvarchar(200) = N'["' + @udrzbar_role + N'","' + @elektro_role + N'"]';
exec dbo.nastav_role_osoby @osoba = @karel, @role = @role2;
revert;
exec sys.sp_set_session_context @key = N'osoba_id', @value = null;

if @c1 <> 50017 throw 60000, N'9: vedoucí přidělil roli (čekáno 50017)', 1;
if (select count(*) from dbo.uzivatel_role where uzivatel_id = @karel) <> 2
  throw 60000, N'9: administrátor nepřidělil dvě role', 1;
if @c2 <> 0 or exists (select 1 from dbo.sablona_ukon where id = '00000000-0000-0000-0000-00000000d010')
  throw 60000, N'9: smazání rozpracované šablony kaskádou neprošlo přes predikáty podřízených', 1;
print N'9. správa osob a kaskáda';
GO

print N'Test prava prošel.';
