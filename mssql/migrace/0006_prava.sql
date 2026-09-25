-- =============================================================================
-- 0006: řádková práva a granty (docs/NASAZENI.md, kolo R3)
--
-- Přepis politik RLS a grantů z PostgreSQL (větev `supabase`, stav po 0025).
-- Stejná pravidla, stejné pomocné funkce z 0002.
--
-- Převod:
--   select USING          -> FILTER predikát
--   insert WITH CHECK     -> BLOCK AFTER INSERT
--   update USING          -> BLOCK BEFORE UPDATE (starý řádek)
--   update WITH CHECK     -> BLOCK AFTER UPDATE (nový řádek)
--   delete USING          -> BLOCK BEFORE DELETE
--   bez politiky          -> BEZ GRANTU. Chybějící BLOCK predikát v SQL Serveru
--                            znamená „povoleno", takže tam, kde PostgreSQL neměl
--                            politiku, se nesmí dát ani právo.
--   sloupcové granty      -> GRANT UPDATE (sloupce); na INSERT sloupcový grant
--                            neexistuje - vytvoreno_at hlídá razítko (0003),
--                            zapsal_id BLOCK predikát.
--
-- Každý predikát pouští db_owner (migrace, seed, testy, procedury s EXECUTE AS
-- OWNER) - RLS SQL Serveru jinak filtruje i vlastníka.
--
-- Výjimky proti PostgreSQL:
--   * uzivatel_role a uzivatel_oblast nemají filtr (zacyklil by se s ma_roli),
--     aplikace čte přes pohledy v_uzivatel_* (0005) a píše procedurami (0004).
--   * Mazání podřízených řádků kaskádou (sablona -> verze -> úkony, zařízení ->
--     soubory, přiřazení): BEFORE DELETE predikát podřízené tabulky pouští
--     řádek, jehož nadřízený už neexistuje. Přímé smazání cizího řádku tím
--     neprojde - FILTER ho neukáže.
--   * tablet, pin, pokus_hesla, prihlaseni, planovac_beh: aplikace žádné právo,
--     jen procedury.
--
-- Principálové: role udrzba_aplikace (členem udrzba_app) a udrzba_planovani
-- (členem udrzba_planovac). Loginy a uživatele zakládá autor projektu (TEST)
-- nebo `npm run mssql:init` (lokálně); bez nich migrace skončí srozumitelnou
-- chybou.
-- =============================================================================

if database_principal_id(N'udrzba_app') is null or database_principal_id(N'udrzba_planovac') is null
  throw 50300, N'0006: v databázi chybí uživatel udrzba_app nebo udrzba_planovac. Založte je (docs/PLAN_PRESUNU.md, K1).', 1;
GO

create schema bezpecnost;
GO

-- -----------------------------------------------------------------------------
-- Predikáty. Inline funkce se SCHEMABINDING; vrací řádek = povoleno.
-- -----------------------------------------------------------------------------

-- Přímo podle oblasti řádku -------------------------------------------------------

create function bezpecnost.vidi_oblast(@oblast uniqueidentifier)
returns table with schemabinding
as return
  select 1 as ok where is_member(N'db_owner') = 1 or dbo.ma_pristup_k_oblasti(@oblast) = 1;
GO

create function bezpecnost.spravuje_zarizeni(@oblast uniqueidentifier)
returns table with schemabinding
as return
  select 1 as ok where is_member(N'db_owner') = 1 or dbo.spravuje_zarizeni_v_oblasti(@oblast) = 1;
GO

create function bezpecnost.spravuje_sablony(@oblast uniqueidentifier)
returns table with schemabinding
as return
  select 1 as ok where is_member(N'db_owner') = 1 or dbo.spravuje_sablony_v_oblasti(@oblast) = 1;
GO

create function bezpecnost.provadi_udrzbu(@oblast uniqueidentifier)
returns table with schemabinding
as return
  select 1 as ok where is_member(N'db_owner') = 1 or dbo.provadi_udrzbu_v_oblasti(@oblast) = 1;
GO

-- Zápis do deníku: v oblasti, kde provádí údržbu, a jen pod svým jménem.
create function bezpecnost.zapisuje_denik(@oblast uniqueidentifier, @zapsal uniqueidentifier)
returns table with schemabinding
as return
  select 1 as ok
  where is_member(N'db_owner') = 1
     or (dbo.provadi_udrzbu_v_oblasti(@oblast) = 1 and @zapsal = dbo.aktualni_uzivatel());
GO

-- Podle role (parametr jen proto, že predikát musí dostat sloupec) -------------

create function bezpecnost.spravuje_ciselniky(@radek uniqueidentifier)
returns table with schemabinding
as return
  select 1 as ok where is_member(N'db_owner') = 1 or dbo.spravuje_ciselniky() = 1;
GO

create function bezpecnost.je_administrator(@radek uniqueidentifier)
returns table with schemabinding
as return
  select 1 as ok where is_member(N'db_owner') = 1 or dbo.ma_roli(N'administrator') = 1;
GO

create function bezpecnost.cte_audit(@radek bigint)
returns table with schemabinding
as return
  select 1 as ok
  where is_member(N'db_owner') = 1
     or dbo.ma_roli(N'administrator') = 1
     or dbo.ma_roli(N'vedouci_udrzby') = 1
     or dbo.ma_roli(N'management') = 1;
GO

-- Vlastní profil, nebo administrátor.
create function bezpecnost.meni_profil(@id uniqueidentifier)
returns table with schemabinding
as return
  select 1 as ok
  where is_member(N'db_owner') = 1 or @id = dbo.aktualni_uzivatel() or dbo.ma_roli(N'administrator') = 1;
GO

-- Přes nadřízený řádek ----------------------------------------------------------
-- „Vidí": nadřízený je vidět a oblast je jeho. „Smí": totéž s právem zápisu.
-- Varianta *_nebo_kaskada navíc pustí řádek bez nadřízeného (mazání kaskádou).

create function bezpecnost.vidi_zarizeni(@zarizeni uniqueidentifier)
returns table with schemabinding
as return
  select 1 as ok where is_member(N'db_owner') = 1
     or exists (select 1 from dbo.zarizeni z where z.id = @zarizeni and dbo.ma_pristup_k_oblasti(z.oblast_id) = 1);
GO

create function bezpecnost.spravuje_zarizeni_stroje(@zarizeni uniqueidentifier)
returns table with schemabinding
as return
  select 1 as ok where is_member(N'db_owner') = 1
     or exists (select 1 from dbo.zarizeni z where z.id = @zarizeni and dbo.spravuje_zarizeni_v_oblasti(z.oblast_id) = 1);
GO

create function bezpecnost.spravuje_zarizeni_stroje_nebo_kaskada(@zarizeni uniqueidentifier)
returns table with schemabinding
as return
  select 1 as ok where is_member(N'db_owner') = 1
     or not exists (select 1 from dbo.zarizeni z where z.id = @zarizeni)
     or exists (select 1 from dbo.zarizeni z where z.id = @zarizeni and dbo.spravuje_zarizeni_v_oblasti(z.oblast_id) = 1);
GO

create function bezpecnost.spravuje_plan_stroje(@zarizeni uniqueidentifier)
returns table with schemabinding
as return
  select 1 as ok where is_member(N'db_owner') = 1
     or exists (select 1 from dbo.zarizeni z where z.id = @zarizeni and dbo.spravuje_sablony_v_oblasti(z.oblast_id) = 1);
GO

create function bezpecnost.provadi_udrzbu_stroje(@zarizeni uniqueidentifier)
returns table with schemabinding
as return
  select 1 as ok where is_member(N'db_owner') = 1
     or exists (select 1 from dbo.zarizeni z where z.id = @zarizeni and dbo.provadi_udrzbu_v_oblasti(z.oblast_id) = 1);
GO

create function bezpecnost.vidi_sablonu(@sablona uniqueidentifier)
returns table with schemabinding
as return
  select 1 as ok where is_member(N'db_owner') = 1
     or exists (select 1 from dbo.sablona s where s.id = @sablona and dbo.ma_pristup_k_oblasti(s.oblast_id) = 1);
GO

create function bezpecnost.spravuje_sablonu(@sablona uniqueidentifier)
returns table with schemabinding
as return
  select 1 as ok where is_member(N'db_owner') = 1
     or exists (select 1 from dbo.sablona s where s.id = @sablona and dbo.spravuje_sablony_v_oblasti(s.oblast_id) = 1);
GO

create function bezpecnost.spravuje_sablonu_nebo_kaskada(@sablona uniqueidentifier)
returns table with schemabinding
as return
  select 1 as ok where is_member(N'db_owner') = 1
     or not exists (select 1 from dbo.sablona s where s.id = @sablona)
     or exists (select 1 from dbo.sablona s where s.id = @sablona and dbo.spravuje_sablony_v_oblasti(s.oblast_id) = 1);
GO

create function bezpecnost.vidi_verzi(@verze uniqueidentifier)
returns table with schemabinding
as return
  select 1 as ok where is_member(N'db_owner') = 1
     or exists (select 1 from dbo.sablona_verze v join dbo.sablona s on s.id = v.sablona_id
                where v.id = @verze and dbo.ma_pristup_k_oblasti(s.oblast_id) = 1);
GO

create function bezpecnost.spravuje_verzi(@verze uniqueidentifier)
returns table with schemabinding
as return
  select 1 as ok where is_member(N'db_owner') = 1
     or exists (select 1 from dbo.sablona_verze v join dbo.sablona s on s.id = v.sablona_id
                where v.id = @verze and dbo.spravuje_sablony_v_oblasti(s.oblast_id) = 1);
GO

create function bezpecnost.spravuje_verzi_nebo_kaskada(@verze uniqueidentifier)
returns table with schemabinding
as return
  select 1 as ok where is_member(N'db_owner') = 1
     or not exists (select 1 from dbo.sablona_verze v where v.id = @verze)
     or exists (select 1 from dbo.sablona_verze v join dbo.sablona s on s.id = v.sablona_id
                where v.id = @verze and dbo.spravuje_sablony_v_oblasti(s.oblast_id) = 1);
GO

create function bezpecnost.vidi_zakazku(@zakazka uniqueidentifier)
returns table with schemabinding
as return
  select 1 as ok where is_member(N'db_owner') = 1
     or exists (select 1 from dbo.zakazka k join dbo.zarizeni z on z.id = k.zarizeni_id
                where k.id = @zakazka and dbo.ma_pristup_k_oblasti(z.oblast_id) = 1);
GO

create function bezpecnost.provadi_zakazku(@zakazka uniqueidentifier)
returns table with schemabinding
as return
  select 1 as ok where is_member(N'db_owner') = 1
     or exists (select 1 from dbo.zakazka k join dbo.zarizeni z on z.id = k.zarizeni_id
                where k.id = @zakazka and dbo.provadi_udrzbu_v_oblasti(z.oblast_id) = 1);
GO

create function bezpecnost.vidi_krok(@krok uniqueidentifier)
returns table with schemabinding
as return
  select 1 as ok where is_member(N'db_owner') = 1
     or exists (select 1 from dbo.zakazka_ukon u join dbo.zakazka k on k.id = u.zakazka_id
                join dbo.zarizeni z on z.id = k.zarizeni_id
                where u.id = @krok and dbo.ma_pristup_k_oblasti(z.oblast_id) = 1);
GO

create function bezpecnost.provadi_krok(@krok uniqueidentifier)
returns table with schemabinding
as return
  select 1 as ok where is_member(N'db_owner') = 1
     or exists (select 1 from dbo.zakazka_ukon u join dbo.zakazka k on k.id = u.zakazka_id
                join dbo.zarizeni z on z.id = k.zarizeni_id
                where u.id = @krok and dbo.provadi_udrzbu_v_oblasti(z.oblast_id) = 1);
GO

create function bezpecnost.vidi_zapis(@zapis uniqueidentifier)
returns table with schemabinding
as return
  select 1 as ok where is_member(N'db_owner') = 1
     or exists (select 1 from dbo.provozni_denik d where d.id = @zapis and dbo.ma_pristup_k_oblasti(d.oblast_id) = 1);
GO

create function bezpecnost.provadi_zapis(@zapis uniqueidentifier)
returns table with schemabinding
as return
  select 1 as ok where is_member(N'db_owner') = 1
     or exists (select 1 from dbo.provozni_denik d where d.id = @zapis and dbo.provadi_udrzbu_v_oblasti(d.oblast_id) = 1);
GO

-- -----------------------------------------------------------------------------
-- Politiky (jedna na tabulku)
-- -----------------------------------------------------------------------------

-- Identita a číselníky (dřív 0001, 0020) -----------------------------------------

create security policy bezpecnost.pravidla_oblast
  add filter predicate bezpecnost.vidi_oblast(id) on dbo.oblast,
  add block  predicate bezpecnost.spravuje_ciselniky(id) on dbo.oblast after insert,
  add block  predicate bezpecnost.spravuje_ciselniky(id) on dbo.oblast before update,
  add block  predicate bezpecnost.spravuje_ciselniky(id) on dbo.oblast after update,
  add block  predicate bezpecnost.je_administrator(id)   on dbo.oblast before delete
  with (state = on, schemabinding = on);
GO

create security policy bezpecnost.pravidla_role
  add block predicate bezpecnost.je_administrator(id) on dbo.[role] after insert,
  add block predicate bezpecnost.je_administrator(id) on dbo.[role] before update,
  add block predicate bezpecnost.je_administrator(id) on dbo.[role] after update,
  add block predicate bezpecnost.je_administrator(id) on dbo.[role] before delete
  with (state = on, schemabinding = on);
GO

create security policy bezpecnost.pravidla_umisteni
  add block predicate bezpecnost.spravuje_ciselniky(id) on dbo.umisteni after insert,
  add block predicate bezpecnost.spravuje_ciselniky(id) on dbo.umisteni before update,
  add block predicate bezpecnost.spravuje_ciselniky(id) on dbo.umisteni after update,
  add block predicate bezpecnost.spravuje_ciselniky(id) on dbo.umisteni before delete
  with (state = on, schemabinding = on);
GO

create security policy bezpecnost.pravidla_druh_zasahu
  add block predicate bezpecnost.spravuje_ciselniky(id) on dbo.druh_zasahu after insert,
  add block predicate bezpecnost.spravuje_ciselniky(id) on dbo.druh_zasahu before update,
  add block predicate bezpecnost.spravuje_ciselniky(id) on dbo.druh_zasahu after update,
  add block predicate bezpecnost.spravuje_ciselniky(id) on dbo.druh_zasahu before delete
  with (state = on, schemabinding = on);
GO

-- Profil čte každý přihlášený; mění vlastní nebo administrátor; zakládá
-- administrátor; nemaže nikdo (bez grantu).
create security policy bezpecnost.pravidla_profil
  add block predicate bezpecnost.je_administrator(id) on dbo.profil after insert,
  add block predicate bezpecnost.meni_profil(id)      on dbo.profil before update,
  add block predicate bezpecnost.meni_profil(id)      on dbo.profil after update
  with (state = on, schemabinding = on);
GO

-- Audit plní triggery (řetězení vlastnictví), aplikace jen čte.
create security policy bezpecnost.pravidla_audit_log
  add filter predicate bezpecnost.cte_audit(id) on dbo.audit_log
  with (state = on, schemabinding = on);
GO

-- Zařízení (dřív 0003) -------------------------------------------------------------

create security policy bezpecnost.pravidla_typ_zarizeni
  add filter predicate bezpecnost.vidi_oblast(oblast_id)       on dbo.typ_zarizeni,
  add block  predicate bezpecnost.spravuje_zarizeni(oblast_id) on dbo.typ_zarizeni after insert,
  add block  predicate bezpecnost.spravuje_zarizeni(oblast_id) on dbo.typ_zarizeni before update,
  add block  predicate bezpecnost.spravuje_zarizeni(oblast_id) on dbo.typ_zarizeni after update,
  add block  predicate bezpecnost.spravuje_ciselniky(id)       on dbo.typ_zarizeni before delete
  with (state = on, schemabinding = on);
GO

create security policy bezpecnost.pravidla_zarizeni
  add filter predicate bezpecnost.vidi_oblast(oblast_id)       on dbo.zarizeni,
  add block  predicate bezpecnost.spravuje_zarizeni(oblast_id) on dbo.zarizeni after insert,
  add block  predicate bezpecnost.spravuje_zarizeni(oblast_id) on dbo.zarizeni before update,
  add block  predicate bezpecnost.spravuje_zarizeni(oblast_id) on dbo.zarizeni after update,
  add block  predicate bezpecnost.spravuje_ciselniky(id)       on dbo.zarizeni before delete
  with (state = on, schemabinding = on);
GO

create security policy bezpecnost.pravidla_zarizeni_soubor
  add filter predicate bezpecnost.vidi_zarizeni(zarizeni_id)                         on dbo.zarizeni_soubor,
  add block  predicate bezpecnost.spravuje_zarizeni_stroje(zarizeni_id)              on dbo.zarizeni_soubor after insert,
  add block  predicate bezpecnost.spravuje_zarizeni_stroje(zarizeni_id)              on dbo.zarizeni_soubor before update,
  add block  predicate bezpecnost.spravuje_zarizeni_stroje(zarizeni_id)              on dbo.zarizeni_soubor after update,
  add block  predicate bezpecnost.spravuje_zarizeni_stroje_nebo_kaskada(zarizeni_id) on dbo.zarizeni_soubor before delete
  with (state = on, schemabinding = on);
GO

-- Šablony a plán (dřív 0006, 0010) -------------------------------------------------

create security policy bezpecnost.pravidla_sablona
  add filter predicate bezpecnost.vidi_oblast(oblast_id)      on dbo.sablona,
  add block  predicate bezpecnost.spravuje_sablony(oblast_id) on dbo.sablona after insert,
  add block  predicate bezpecnost.spravuje_sablony(oblast_id) on dbo.sablona before update,
  add block  predicate bezpecnost.spravuje_sablony(oblast_id) on dbo.sablona after update,
  add block  predicate bezpecnost.spravuje_ciselniky(id)      on dbo.sablona before delete
  with (state = on, schemabinding = on);
GO

create security policy bezpecnost.pravidla_sablona_verze
  add filter predicate bezpecnost.vidi_sablonu(sablona_id)                  on dbo.sablona_verze,
  add block  predicate bezpecnost.spravuje_sablonu(sablona_id)              on dbo.sablona_verze after insert,
  add block  predicate bezpecnost.spravuje_sablonu(sablona_id)              on dbo.sablona_verze before update,
  add block  predicate bezpecnost.spravuje_sablonu(sablona_id)              on dbo.sablona_verze after update,
  add block  predicate bezpecnost.spravuje_sablonu_nebo_kaskada(sablona_id) on dbo.sablona_verze before delete
  with (state = on, schemabinding = on);
GO

create security policy bezpecnost.pravidla_sablona_ukon
  add filter predicate bezpecnost.vidi_verzi(sablona_verze_id)                  on dbo.sablona_ukon,
  add block  predicate bezpecnost.spravuje_verzi(sablona_verze_id)              on dbo.sablona_ukon after insert,
  add block  predicate bezpecnost.spravuje_verzi(sablona_verze_id)              on dbo.sablona_ukon before update,
  add block  predicate bezpecnost.spravuje_verzi(sablona_verze_id)              on dbo.sablona_ukon after update,
  add block  predicate bezpecnost.spravuje_verzi_nebo_kaskada(sablona_verze_id) on dbo.sablona_ukon before delete
  with (state = on, schemabinding = on);
GO

create security policy bezpecnost.pravidla_zarizeni_sablona
  add filter predicate bezpecnost.vidi_oblast(oblast_id)                             on dbo.zarizeni_sablona,
  add block  predicate bezpecnost.spravuje_sablony(oblast_id)                        on dbo.zarizeni_sablona after insert,
  add block  predicate bezpecnost.spravuje_sablony(oblast_id)                        on dbo.zarizeni_sablona before update,
  add block  predicate bezpecnost.spravuje_sablony(oblast_id)                        on dbo.zarizeni_sablona after update,
  add block  predicate bezpecnost.spravuje_zarizeni_stroje_nebo_kaskada(zarizeni_id) on dbo.zarizeni_sablona before delete
  with (state = on, schemabinding = on);
GO

-- Plán: zakládá ho srovnej_plan (EXECUTE AS OWNER), termíny zadává garant,
-- nemaže nikdo (bez grantu; mizí jen kaskádou s přiřazením).
create security policy bezpecnost.pravidla_plan_udrzby
  add filter predicate bezpecnost.vidi_zarizeni(zarizeni_id)        on dbo.plan_udrzby,
  add block  predicate bezpecnost.spravuje_plan_stroje(zarizeni_id) on dbo.plan_udrzby after insert,
  add block  predicate bezpecnost.spravuje_plan_stroje(zarizeni_id) on dbo.plan_udrzby before update,
  add block  predicate bezpecnost.spravuje_plan_stroje(zarizeni_id) on dbo.plan_udrzby after update
  with (state = on, schemabinding = on);
GO

-- Zakázky (dřív 0011, 0021): zakládá plánovač, mění technik oblasti (jen
-- vybrané sloupce, viz granty), nemaže nikdo.
create security policy bezpecnost.pravidla_zakazka
  add filter predicate bezpecnost.vidi_zarizeni(zarizeni_id)         on dbo.zakazka,
  add block  predicate bezpecnost.provadi_udrzbu_stroje(zarizeni_id) on dbo.zakazka before update,
  add block  predicate bezpecnost.provadi_udrzbu_stroje(zarizeni_id) on dbo.zakazka after update
  with (state = on, schemabinding = on);
GO

create security policy bezpecnost.pravidla_zakazka_ukon
  add filter predicate bezpecnost.vidi_zakazku(zakazka_id)    on dbo.zakazka_ukon,
  add block  predicate bezpecnost.provadi_zakazku(zakazka_id) on dbo.zakazka_ukon before update,
  add block  predicate bezpecnost.provadi_zakazku(zakazka_id) on dbo.zakazka_ukon after update
  with (state = on, schemabinding = on);
GO

create security policy bezpecnost.pravidla_zakazka_foto
  add filter predicate bezpecnost.vidi_krok(zakazka_ukon_id)    on dbo.zakazka_foto,
  add block  predicate bezpecnost.provadi_krok(zakazka_ukon_id) on dbo.zakazka_foto after insert,
  add block  predicate bezpecnost.provadi_krok(zakazka_ukon_id) on dbo.zakazka_foto before update,
  add block  predicate bezpecnost.provadi_krok(zakazka_ukon_id) on dbo.zakazka_foto after update,
  add block  predicate bezpecnost.provadi_krok(zakazka_ukon_id) on dbo.zakazka_foto before delete
  with (state = on, schemabinding = on);
GO

-- Provozní deník (dřív 0020, 0022). Okno 24 h na opravu hlídá trigger (0003).
create security policy bezpecnost.pravidla_provozni_denik
  add filter predicate bezpecnost.vidi_oblast(oblast_id)               on dbo.provozni_denik,
  add block  predicate bezpecnost.zapisuje_denik(oblast_id, zapsal_id) on dbo.provozni_denik after insert,
  add block  predicate bezpecnost.provadi_udrzbu(oblast_id)            on dbo.provozni_denik before update,
  add block  predicate bezpecnost.provadi_udrzbu(oblast_id)            on dbo.provozni_denik after update
  with (state = on, schemabinding = on);
GO

create security policy bezpecnost.pravidla_denik_foto
  add filter predicate bezpecnost.vidi_zapis(zaznam_id)    on dbo.denik_foto,
  add block  predicate bezpecnost.provadi_zapis(zaznam_id) on dbo.denik_foto after insert,
  add block  predicate bezpecnost.provadi_zapis(zaznam_id) on dbo.denik_foto before update,
  add block  predicate bezpecnost.provadi_zapis(zaznam_id) on dbo.denik_foto after update,
  add block  predicate bezpecnost.provadi_zapis(zaznam_id) on dbo.denik_foto before delete
  with (state = on, schemabinding = on);
GO

-- -----------------------------------------------------------------------------
-- Role a granty
-- -----------------------------------------------------------------------------

-- Role přežijí mazání objektů v testech (scripts/lib/obnova.mjs maže objekty,
-- ne principály), proto idempotentně.
if database_principal_id(N'udrzba_aplikace') is null
  create role udrzba_aplikace;
if database_principal_id(N'udrzba_planovani') is null
  create role udrzba_planovani;
if is_rolemember(N'udrzba_aplikace', N'udrzba_app') = 0
  alter role udrzba_aplikace add member udrzba_app;
if is_rolemember(N'udrzba_planovani', N'udrzba_planovac') = 0
  alter role udrzba_planovani add member udrzba_planovac;
GO

-- Plná práva (omezuje je RLS výš).
grant select, insert, update, delete on dbo.oblast           to udrzba_aplikace;
grant select, insert, update, delete on dbo.[role]           to udrzba_aplikace;
grant select, insert, update, delete on dbo.umisteni         to udrzba_aplikace;
grant select, insert, update, delete on dbo.druh_zasahu      to udrzba_aplikace;
grant select, insert, update, delete on dbo.typ_zarizeni     to udrzba_aplikace;
grant select, insert, update, delete on dbo.zarizeni         to udrzba_aplikace;
grant select, insert, update, delete on dbo.zarizeni_soubor  to udrzba_aplikace;
grant select, insert, update, delete on dbo.sablona          to udrzba_aplikace;
grant select, insert, update, delete on dbo.sablona_verze    to udrzba_aplikace;
grant select, insert, update, delete on dbo.sablona_ukon     to udrzba_aplikace;
grant select, insert, update, delete on dbo.zarizeni_sablona to udrzba_aplikace;

-- Bez mazání.
grant select, insert, update on dbo.profil      to udrzba_aplikace;
grant select, insert, update on dbo.plan_udrzby to udrzba_aplikace;

-- Jen čtení.
grant select on dbo.audit_log to udrzba_aplikace;

-- Zakázky: zakládá plánovač, technik mění jen stav a vyplňování (dřív 0021).
grant select on dbo.zakazka to udrzba_aplikace;
grant update (stav, prirazeno_uzivateli_id, zahajeno_at, dokonceno_at, dokoncil_id, poznamka)
  on dbo.zakazka to udrzba_aplikace;
grant select on dbo.zakazka_ukon to udrzba_aplikace;
grant update (stav, hodnota, poznamka, kontrolni_body, potvrzeno_at, potvrdil_id)
  on dbo.zakazka_ukon to udrzba_aplikace;
grant select, insert, delete on dbo.zakazka_foto to udrzba_aplikace;
grant update (popis) on dbo.zakazka_foto to udrzba_aplikace;

-- Deník: zapsal_id se po zápisu nemění, vytvoreno_at přepíše razítko (dřív 0020).
grant select, insert on dbo.provozni_denik to udrzba_aplikace;
grant update (zarizeni_id, oblast_id, druh_zasahu_id, popis, provedeno_at, provedl_id, doba_trvani_min)
  on dbo.provozni_denik to udrzba_aplikace;
grant select, insert, delete on dbo.denik_foto to udrzba_aplikace;
grant update (popis) on dbo.denik_foto to udrzba_aplikace;

-- Pohledy (RLS se uplatní podle toho, kdo čte; v_uzivatel_* filtrují samy).
grant select on dbo.v_dnesni_plan           to udrzba_aplikace;
grant select on dbo.v_po_terminu            to udrzba_aplikace;
grant select on dbo.v_plneni_matice         to udrzba_aplikace;
grant select on dbo.v_pripravenost_zarizeni to udrzba_aplikace;
grant select on dbo.v_historie_zarizeni     to udrzba_aplikace;
grant select on dbo.v_uzivatel_role         to udrzba_aplikace;
grant select on dbo.v_uzivatel_oblast       to udrzba_aplikace;

-- Procedury a funkce, které volá aplikace. Nevolá: srovnej_plan, zaloz_zakazky,
-- over_pin_osoby, spust_planovac, vytvor_auditni_trigger.
grant execute on dbo.zaloz_navrh_verze        to udrzba_aplikace;
grant execute on dbo.aktivuj_verzi            to udrzba_aplikace;
grant execute on dbo.naplanuj_zarizeni        to udrzba_aplikace;
grant execute on dbo.dokonci_zakazku          to udrzba_aplikace;
grant execute on dbo.muze_menit_zapis_deniku  to udrzba_aplikace;
grant execute on dbo.nastav_role_osoby        to udrzba_aplikace;
grant execute on dbo.nastav_oblasti_osoby     to udrzba_aplikace;
grant execute on dbo.osoba_pro_prihlaseni     to udrzba_aplikace;
grant execute on dbo.nacti_prihlaseni         to udrzba_aplikace;
grant execute on dbo.nastav_heslo             to udrzba_aplikace;
grant execute on dbo.stav_pokusu_hesla        to udrzba_aplikace;
grant execute on dbo.zapis_pokusu_hesla       to udrzba_aplikace;
grant execute on dbo.zaregistruj_tablet       to udrzba_aplikace;
grant execute on dbo.zrus_tablet              to udrzba_aplikace;
grant execute on dbo.seznam_pro_tablet        to udrzba_aplikace;
grant execute on dbo.prihlas_pinem            to udrzba_aplikace;
grant execute on dbo.nastav_pin               to udrzba_aplikace;
grant execute on dbo.zmen_pin                 to udrzba_aplikace;
grant execute on dbo.odemkni_pin              to udrzba_aplikace;

-- Noční plánovač smí jen tohle.
grant execute on dbo.spust_planovac to udrzba_planovani;
GO
