-- =============================================================================
-- Test triggerů (0003): razítka a audit, zámky, kontrola parametrů, úklid
-- po změně schématu, provozní deník.
--
-- Úmluva (scripts/mssql-testy.mjs): autocommit jako vlastník databáze,
-- neúspěch = THROW 60000, průběh PRINT. THROW v triggeru vrátí celou
-- transakci, proto se fixtury zapisují natrvalo (pevná id ...a0xx) a každý
-- očekávaný zákaz je samostatný příkaz v TRY/CATCH. Uklidí spouštěč.
-- Vyžaduje celý seed včetně osob.
-- =============================================================================
set nocount on;

-- 1. Razítka a tvar auditu ----------------------------------------------------
declare @id uniqueidentifier = '00000000-0000-0000-0000-00000000a001';
insert into dbo.oblast (id, kod, nazev, vytvoreno_at, zmeneno_at)
values (@id, N'test_audit', N'Test auditu', '2000-01-01', '2000-01-01');

declare @vytvoreno datetime2(3), @zmeneno datetime2(3);
select @vytvoreno = vytvoreno_at, @zmeneno = zmeneno_at from dbo.oblast where id = @id;
if @vytvoreno < dateadd(minute, -5, sysutcdatetime()) or @zmeneno <> @vytvoreno
  throw 60000, N'1: INSERT nepřepsal razítka poslaná klientem', 1;

declare @novy nvarchar(max), @pocet int;
select @pocet = count(*), @novy = max(novy_stav)
from dbo.audit_log where tabulka = N'oblast' and zaznam_id = lower(cast(@id as nchar(36))) and operace = N'INSERT';
if @pocet <> 1 throw 60000, N'1: INSERT nemá právě jeden řádek auditu', 1;
if json_value(@novy, N'$.id') <> lower(cast(@id as nchar(36)))
  throw 60000, N'1: GUID v auditu není malými písmeny', 1;
if json_value(@novy, N'$.vytvoreno_at') not like N'%Z'
  throw 60000, N'1: čas v auditu nekončí na Z', 1;
if json_value(@novy, N'$.aktivni') <> N'true'
  throw 60000, N'1: bit v auditu není true/false', 1;

-- UPDATE: jeden řádek auditu (razítko nesmí zapsat druhý), vytvoreno_at
-- zůstává, i když ho klient zkusí přepsat.
update dbo.oblast set nazev = N'Test auditu 2', vytvoreno_at = '2000-01-01' where id = @id;
if (select vytvoreno_at from dbo.oblast where id = @id) <> @vytvoreno
  throw 60000, N'1: UPDATE dovolil přepsat vytvoreno_at', 1;
select @pocet = count(*) from dbo.audit_log
where tabulka = N'oblast' and zaznam_id = lower(cast(@id as nchar(36))) and operace = N'UPDATE';
if @pocet <> 1 throw 60000, N'1: UPDATE zapsal jiný počet řádků auditu než jeden (razítko?)', 1;
if (select json_value(stary_stav, N'$.nazev') + N'|' + json_value(novy_stav, N'$.nazev')
    from dbo.audit_log where tabulka = N'oblast' and zaznam_id = lower(cast(@id as nchar(36))) and operace = N'UPDATE')
   <> N'Test auditu|Test auditu 2'
  throw 60000, N'1: UPDATE v auditu nemá starý a nový stav', 1;

delete from dbo.oblast where id = @id;
if not exists (select 1 from dbo.audit_log
               where tabulka = N'oblast' and zaznam_id = lower(cast(@id as nchar(36)))
                 and operace = N'DELETE' and novy_stav is null and stary_stav is not null)
  throw 60000, N'1: DELETE nemá řádek auditu se starým stavem', 1;
print N'1. razítka a tvar auditu';
GO

-- 2. JSON sloupec jako vnořený JSON, vazební tabulka s klíčem uzivatel_id -----
declare @typ uniqueidentifier = (select id from dbo.typ_zarizeni where kod = N'frezka');
update dbo.typ_zarizeni set schema_parametru = N'{"otacky":{"typ":"cislo"}}' where id = @typ;
if json_query((select top (1) novy_stav from dbo.audit_log
               where tabulka = N'typ_zarizeni' and zaznam_id = lower(cast(@typ as nchar(36)))
               order by id desc), N'$.schema_parametru') is null
  throw 60000, N'2: JSON sloupec je v auditu jako text, ne jako objekt', 1;

declare @osoba uniqueidentifier = (select id from dbo.profil where email = N'management@senco.test');
declare @role uniqueidentifier = (select id from dbo.[role] where kod = N'udrzbar');
insert into dbo.uzivatel_role (uzivatel_id, role_id) values (@osoba, @role);
if not exists (select 1 from dbo.audit_log
               where tabulka = N'uzivatel_role' and zaznam_id = lower(cast(@osoba as nchar(36))) and operace = N'INSERT')
  throw 60000, N'2: vazební tabulka nemá v auditu zaznam_id = uzivatel_id', 1;
delete from dbo.uzivatel_role where uzivatel_id = @osoba and role_id = @role;
print N'2. JSON sloupec a vazební tabulka';
GO

-- 3. Parametry zařízení -------------------------------------------------------
declare @typ uniqueidentifier = (select id from dbo.typ_zarizeni where kod = N'soustruh');
declare @oblast uniqueidentifier = (select oblast_id from dbo.typ_zarizeni where id = @typ);
update dbo.typ_zarizeni
set schema_parametru = N'{"otacky":{"typ":"cislo","popisek":"Otáčky","povinne":true},"chlazeni":{"typ":"vyber","moznosti":["emulze","vzduch"]}}'
where id = @typ;

begin try
  insert into dbo.zarizeni (id, oblast_id, typ_zarizeni_id, nazev, parametry)
  values ('00000000-0000-0000-0000-00000000a031', @oblast, @typ, N'T', N'{"otacky":1,"preklep":2}');
  throw 60000, N'3: neznámý parametr prošel', 1;
end try
begin catch
  if error_number() <> 50101 throw 60000, N'3: neznámý parametr - čekána chyba 50101', 1;
end catch;

begin try
  insert into dbo.zarizeni (id, oblast_id, typ_zarizeni_id, nazev, parametry)
  values ('00000000-0000-0000-0000-00000000a031', @oblast, @typ, N'T', N'{"otacky":"hodně"}');
  throw 60000, N'3: text v číselném parametru prošel', 1;
end try
begin catch
  if error_number() <> 50102 or error_message() not like N'%Otáčky%musí být číslo%'
    throw 60000, N'3: špatný typ - čekána chyba 50102 s popiskem', 1;
end catch;

begin try
  insert into dbo.zarizeni (id, oblast_id, typ_zarizeni_id, nazev, parametry)
  values ('00000000-0000-0000-0000-00000000a031', @oblast, @typ, N'T', N'{"otacky":1,"chlazeni":"olej"}');
  throw 60000, N'3: hodnota mimo výběr prošla', 1;
end try
begin catch
  if error_number() <> 50102 throw 60000, N'3: mimo výběr - čekána chyba 50102', 1;
end catch;

begin try
  insert into dbo.zarizeni (id, oblast_id, typ_zarizeni_id, nazev, parametry)
  values ('00000000-0000-0000-0000-00000000a031', @oblast, @typ, N'T', N'{"chlazeni":"vzduch"}');
  throw 60000, N'3: chybějící povinný parametr prošel', 1;
end try
begin catch
  if error_number() <> 50103 throw 60000, N'3: povinný parametr - čekána chyba 50103', 1;
end catch;

insert into dbo.zarizeni (id, oblast_id, typ_zarizeni_id, nazev, parametry)
values ('00000000-0000-0000-0000-00000000a031', @oblast, @typ, N'T', N'{"otacky":1200,"chlazeni":"emulze"}');

-- Úklid po změně schématu: chlazeni zmizí ze stroje, nový povinný parametr
-- úklid nezastaví (doplní se při první úpravě stroje).
update dbo.typ_zarizeni
set schema_parametru = N'{"otacky":{"typ":"cislo","povinne":true},"vykon":{"typ":"cislo","povinne":true}}'
where id = @typ;
declare @parametry nvarchar(max) = (select parametry from dbo.zarizeni where id = '00000000-0000-0000-0000-00000000a031');
if json_value(@parametry, N'$.chlazeni') is not null or json_value(@parametry, N'$.otacky') <> N'1200'
  throw 60000, N'3: úklid po změně schématu neodebral osiřelý parametr (nebo vzal i platný)', 1;
print N'3. parametry zařízení a úklid po změně schématu';
GO

-- 4. Verze šablony a matice ---------------------------------------------------
declare @oblast uniqueidentifier = (select id from dbo.oblast where kod = N'cnc');
declare @role uniqueidentifier = (select id from dbo.[role] where kod = N'specialista_cnc');
insert into dbo.sablona (id, oblast_id, kod, nazev)
values ('00000000-0000-0000-0000-00000000a041', @oblast, N'test_triggery', N'Test triggerů');
insert into dbo.sablona_verze (id, sablona_id, cislo_verze, stav)
values ('00000000-0000-0000-0000-00000000a042', '00000000-0000-0000-0000-00000000a041', 1, N'navrh');
insert into dbo.sablona_ukon (sablona_verze_id, poradi, nazev, interval_typ, interval_hodnota, profese_role_id)
values ('00000000-0000-0000-0000-00000000a042', 1, N'Mazání', N'tydny', 1, @role);
update dbo.sablona_verze set stav = N'aktivni', platna_od = sysutcdatetime()
where id = '00000000-0000-0000-0000-00000000a042';

begin try
  update dbo.sablona_verze set poznamka_ke_zmene = N'přepis' where id = '00000000-0000-0000-0000-00000000a042';
  throw 60000, N'4: aktivovaná verze šla změnit', 1;
end try
begin catch
  if error_number() <> 50112 throw 60000, N'4: změna aktivní verze - čekána chyba 50112', 1;
end catch;

begin try
  delete from dbo.sablona_verze where id = '00000000-0000-0000-0000-00000000a042';
  throw 60000, N'4: aktivovaná verze šla smazat', 1;
end try
begin catch
  if error_number() <> 50111 throw 60000, N'4: smazání aktivní verze - čekána chyba 50111', 1;
end catch;

begin try
  insert into dbo.sablona_ukon (sablona_verze_id, poradi, nazev, interval_typ, interval_hodnota, profese_role_id)
  values ('00000000-0000-0000-0000-00000000a042', 2, N'Navíc', N'dny', 1, @role);
  throw 60000, N'4: úkon do aktivní verze prošel', 1;
end try
begin catch
  if error_number() <> 50113 throw 60000, N'4: úkon do aktivní verze - čekána chyba 50113', 1;
end catch;

-- Archivace je jediná povolená změna.
update dbo.sablona_verze set stav = N'archivovana' where id = '00000000-0000-0000-0000-00000000a042';
print N'4. verze šablony a matice';
GO

-- 5. Uzavřená zakázka ---------------------------------------------------------
declare @stroj uniqueidentifier = (select top (1) z.id from dbo.zarizeni z join dbo.oblast o on o.id = z.oblast_id
                                   where o.kod = N'cnc' order by z.nazev);
declare @role uniqueidentifier = (select id from dbo.[role] where kod = N'specialista_cnc');
declare @zakazka uniqueidentifier = '00000000-0000-0000-0000-00000000a051';
declare @ukon uniqueidentifier = '00000000-0000-0000-0000-00000000a052';
insert into dbo.zakazka (id, zarizeni_id, sablona_verze_id, profese_role_id, planovany_termin)
values (@zakazka, @stroj, '00000000-0000-0000-0000-00000000a042', @role, dbo.dnes());
insert into dbo.zakazka_ukon (id, zakazka_id, poradi, nazev_snapshot, kontrolni_body)
values (@ukon, @zakazka, 1, N'Mazání', N'[{"nazev":"Hladina","typ":"ano_ne"}]');

-- Odpověď se vyplnit smí, otázka se měnit nesmí.
update dbo.zakazka_ukon set kontrolni_body = N'[{"nazev":"Hladina","typ":"ano_ne","ano":true}]' where id = @ukon;
begin try
  update dbo.zakazka_ukon set kontrolni_body = N'[{"nazev":"Jiná otázka","typ":"ano_ne","ano":true}]' where id = @ukon;
  throw 60000, N'5: změna zadání kontrolního bodu prošla', 1;
end try
begin catch
  if error_number() <> 50124 throw 60000, N'5: změna zadání - čekána chyba 50124', 1;
end catch;

-- Uzavření projde (a razítko po něm nesmí narazit na zámek).
update dbo.zakazka set stav = N'dokonceno', dokonceno_at = sysutcdatetime() where id = @zakazka;
if (select stav from dbo.zakazka where id = @zakazka) <> N'dokonceno'
  throw 60000, N'5: zakázku nešlo uzavřít', 1;

begin try
  update dbo.zakazka set poznamka = N'dodatečně' where id = @zakazka;
  throw 60000, N'5: uzavřená zakázka šla změnit', 1;
end try
begin catch
  if error_number() <> 50122 throw 60000, N'5: změna uzavřené - čekána chyba 50122', 1;
end catch;

begin try
  delete from dbo.zakazka where id = @zakazka;
  throw 60000, N'5: zakázka šla smazat', 1;
end try
begin catch
  if error_number() <> 50121 throw 60000, N'5: smazání zakázky - čekána chyba 50121', 1;
end catch;

begin try
  update dbo.zakazka_ukon set poznamka = N'dodatečně' where id = @ukon;
  throw 60000, N'5: checklist uzavřené zakázky šel změnit', 1;
end try
begin catch
  if error_number() <> 50123 throw 60000, N'5: checklist uzavřené - čekána chyba 50123', 1;
end catch;

begin try
  insert into dbo.zakazka_foto (zakazka_ukon_id, storage_path) values (@ukon, N'test/a052.jpg');
  throw 60000, N'5: fotka k uzavřené zakázce prošla', 1;
end try
begin catch
  if error_number() <> 50125 throw 60000, N'5: fotka k uzavřené - čekána chyba 50125', 1;
end catch;
print N'5. uzavřená zakázka';
GO

-- 6. Provozní deník -----------------------------------------------------------
declare @stroj uniqueidentifier = (select top (1) z.id from dbo.zarizeni z join dbo.oblast o on o.id = z.oblast_id
                                   where o.kod = N'cnc' order by z.nazev);
declare @oblast uniqueidentifier = (select oblast_id from dbo.zarizeni where id = @stroj);
declare @druh uniqueidentifier = (select id from dbo.druh_zasahu where kod = N'cisteni');
declare @autor uniqueidentifier = (select id from dbo.profil where email = N'cnc@senco.test');
declare @vedouci uniqueidentifier = (select id from dbo.profil where email = N'vedouci@senco.test');
declare @zapis uniqueidentifier = '00000000-0000-0000-0000-00000000a061';

exec sys.sp_set_session_context @key = N'osoba_id', @value = @autor;
begin try
  insert into dbo.provozni_denik (zarizeni_id, oblast_id, druh_zasahu_id, popis, provedeno_at)
  values (@stroj, @oblast, @druh, N'Dopředu', dateadd(day, 3, sysutcdatetime()));
  throw 60000, N'6: zásah zapsaný dopředu prošel', 1;
end try
begin catch
  if error_number() <> 50132 throw 60000, N'6: zásah dopředu - čekána chyba 50132', 1;
end catch;

insert into dbo.provozni_denik (id, zarizeni_id, oblast_id, druh_zasahu_id, popis)
values (@zapis, @stroj, @oblast, @druh, N'Test deníku');
if (select zapsal_id from dbo.provozni_denik where id = @zapis) <> @autor
  throw 60000, N'6: zapsal_id nepřevzal přihlášenou osobu', 1;

-- Autor do 24 h opravit smí, i s fotkou.
update dbo.provozni_denik set popis = N'Test deníku, opraveno' where id = @zapis;
insert into dbo.denik_foto (zaznam_id, storage_path) values (@zapis, N'test/a061.jpg');

begin try
  delete from dbo.provozni_denik where id = @zapis;
  throw 60000, N'6: zápis v deníku šel smazat', 1;
end try
begin catch
  if error_number() <> 50131 throw 60000, N'6: smazání zápisu - čekána chyba 50131', 1;
end catch;

-- Vedoucí údržby smí opravit cizí zápis kdykoli.
exec sys.sp_set_session_context @key = N'osoba_id', @value = @vedouci;
update dbo.provozni_denik set popis = N'Opravil vedoucí' where id = @zapis;

-- Zápis zestárne: autor už opravit nesmí. Razítko by vytvoreno_at vrátilo,
-- proto se na chvíli vypnou triggery.
alter table dbo.provozni_denik disable trigger all;
update dbo.provozni_denik set vytvoreno_at = dateadd(hour, -25, sysutcdatetime()) where id = @zapis;
alter table dbo.provozni_denik enable trigger all;

exec sys.sp_set_session_context @key = N'osoba_id', @value = @autor;
begin try
  update dbo.provozni_denik set popis = N'Pozdě' where id = @zapis;
  throw 60000, N'6: autor opravil zápis starší 24 h', 1;
end try
begin catch
  if error_number() <> 50002 throw 60000, N'6: starý zápis - čekána chyba 50002', 1;
end catch;

-- Obejít okno přepsáním vytvoreno_at nejde: rozhoduje stará hodnota.
begin try
  update dbo.provozni_denik set popis = N'Obejití', vytvoreno_at = sysutcdatetime() where id = @zapis;
  throw 60000, N'6: přepsání vytvoreno_at obešlo okno na opravu', 1;
end try
begin catch
  if error_number() <> 50002 throw 60000, N'6: obejití okna - čekána chyba 50002', 1;
end catch;

begin try
  insert into dbo.denik_foto (zaznam_id, storage_path) values (@zapis, N'test/a061-2.jpg');
  throw 60000, N'6: fotka ke starému zápisu prošla', 1;
end try
begin catch
  if error_number() <> 50004 throw 60000, N'6: fotka ke starému - čekána chyba 50004', 1;
end catch;

-- Pracovník skladu do CNC nemá přístup: pro něj je to cizí zápis.
declare @sklad uniqueidentifier = (select id from dbo.profil where email = N'sklad@senco.test');
exec sys.sp_set_session_context @key = N'osoba_id', @value = @sklad;
begin try
  update dbo.provozni_denik set popis = N'Cizí' where id = @zapis;
  throw 60000, N'6: cizí osoba opravila zápis', 1;
end try
begin catch
  if error_number() <> 50001 throw 60000, N'6: cizí zápis - čekána chyba 50001', 1;
end catch;

begin try
  insert into dbo.denik_foto (zaznam_id, storage_path) values (@zapis, N'test/a061-3.jpg');
  throw 60000, N'6: fotka k cizímu zápisu prošla', 1;
end try
begin catch
  if error_number() <> 50003 throw 60000, N'6: fotka k cizímu - čekána chyba 50003', 1;
end catch;

exec sys.sp_set_session_context @key = N'osoba_id', @value = null;
print N'6. provozní deník';
GO

print N'Test triggery prošel.';
