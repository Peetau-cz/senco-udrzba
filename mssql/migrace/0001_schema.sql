-- =============================================================================
-- 0001: schéma databáze Udrzba (docs/NASAZENI.md)
--
-- Konsolidovaný přepis stavu po 25 migracích PostgreSQL (větev `supabase`,
-- commit c8a2500) do T-SQL. Tabulky, omezení a indexy; funkce, triggery,
-- procedury a pohledy jsou v dalších souborech (kolo R2), oprávnění a RLS
-- v kole R3.
--
-- Převod idiomů (podrobně v NASAZENI.md, kap. 3):
--   uuid / gen_random_uuid()  -> uniqueidentifier default newid()
--   timestamptz / now()       -> datetime2(3) v UTC, sysutcdatetime()
--   text                      -> nvarchar s rozumnou délkou (popisy nvarchar(max))
--   boolean                   -> bit
--   numeric                   -> decimal(18,4)
--   výčtový typ               -> nvarchar(30) + CHECK ck_<tabulka>_<sloupec>
--   jsonb                     -> nvarchar(max) + CHECK isjson() + tvarová funkce
--   částečný index            -> filtrovaný index
--   unikát s více NULL        -> filtrovaný unikátní index (SQL Server bere NULL = NULL)
--   deferrable unique         -> obyčejný unikát (kontroluje se na konci příkazu)
--   cizí klíče na profil      -> NO ACTION (více kaskádových cest SQL Server odmítá,
--                                chyba 1785; osoba se stejně nemaže, zásada R5)
--   on update cascade         -> vynecháno, uuid klíče se nemění
--
-- Názvy omezení zůstávají z PostgreSQL tam, kde je aplikace čte z chybových
-- hlášek (profil_osobni_cislo_key, profil_email_idx).
-- CHECK omezení mají předponu ck_, aby je src/lib/db/chyby.ts poznalo
-- v každém jazyce serveru.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Šev identity a dnešek
-- -----------------------------------------------------------------------------

-- Id přihlášené OSOBY (profil.id). Nastavuje ho aplikace na začátku každé
-- transakce přes sp_set_session_context; bez něj vrací NULL. Politiky, triggery
-- i procedury se ptají výhradně tady, mechanismus přihlášení neznají (R6).
create function dbo.aktualni_uzivatel()
returns uniqueidentifier
with schemabinding
as
begin
  return try_cast(session_context(N'osoba_id') as uniqueidentifier);
end;
GO

-- Dnešní datum v pražském čase. Plánovač i pohledy počítají s tímhle, ne
-- s UTC (na Supabase běžel current_date v UTC, což po půlnoci lhalo o hodinu).
create function dbo.dnes()
returns date
with schemabinding
as
begin
  return cast(sysutcdatetime() at time zone 'UTC' at time zone 'Central Europe Standard Time' as date);
end;
GO

-- -----------------------------------------------------------------------------
-- Tvarové kontroly JSON (dřív immutable funkce v CHECK omezeních)
--
-- Typy z OPENJSON: 0 null, 1 text, 2 číslo, 3 ano/ne, 4 pole, 5 objekt.
-- Klíče se porovnávají binárně - JSON rozlišuje velikost písmen, kolace
-- databáze ne.
-- -----------------------------------------------------------------------------

-- Definice technických parametrů typu zařízení:
--   {"otacky": {"typ": "cislo", "popisek": "Otáčky", "jednotka": "1/min", "povinne": true},
--    "chlazeni": {"typ": "vyber", "moznosti": ["emulze", "vzduch"]}}
-- Objekt, každá hodnota objekt s typ ∈ text/cislo/ano_ne/vyber; vyber má
-- neprázdné pole moznosti. NULL je platný.
create function dbo.je_platne_schema_parametru(@schema nvarchar(max))
returns bit
with schemabinding
as
begin
  if @schema is null return 1;
  if isjson(@schema) <> 1 return 0;
  if left(ltrim(@schema), 1) <> N'{' return 0;
  if exists (
    select 1
    from openjson(@schema) as pole
    where pole.[type] <> 5
       or json_value(pole.[value], N'$.typ') is null
       or json_value(pole.[value], N'$.typ') not in (N'text', N'cislo', N'ano_ne', N'vyber')
       or (
         json_value(pole.[value], N'$.typ') = N'vyber'
         and (
           json_query(pole.[value], N'$.moznosti') is null
           or left(ltrim(json_query(pole.[value], N'$.moznosti')), 1) <> N'['
           or not exists (select 1 from openjson(json_query(pole.[value], N'$.moznosti')))
         )
       )
  ) return 0;
  return 1;
end;
GO

-- Kontrolní body úkonu v šabloně (otázky):
--   [{"nazev": "1000 ot.", "typ": "hodnota"}, {"nazev": "Kryt dotažen", "typ": "ano_ne"}]
create function dbo.jsou_platne_kontrolni_body(@body nvarchar(max))
returns bit
with schemabinding
as
begin
  if @body is null return 1;
  if isjson(@body) <> 1 return 0;
  if left(ltrim(@body), 1) <> N'[' return 0;
  if exists (
    select 1
    from openjson(@body) as prvek
    where prvek.[type] <> 5
       or json_value(prvek.[value], N'$.nazev') is null
       or len(ltrim(rtrim(json_value(prvek.[value], N'$.nazev')))) = 0
       or json_value(prvek.[value], N'$.typ') is null
       or json_value(prvek.[value], N'$.typ') not in (N'hodnota', N'ano_ne')
  ) return 0;
  return 1;
end;
GO

-- Kontrolní body v zakázce (otázky i odpovědi v jednom prvku):
--   [{"nazev": "1000 ot.", "typ": "hodnota", "hodnota": 4.2},
--    {"nazev": "Kryt dotažen", "typ": "ano_ne", "ano": true}]
-- U typu hodnota smí být klíč hodnota jen číslo nebo null a klíč ano nesmí
-- existovat; u ano_ne obráceně.
create function dbo.jsou_platne_odpovedi_bodu(@body nvarchar(max))
returns bit
with schemabinding
as
begin
  if @body is null return 1;
  if isjson(@body) <> 1 return 0;
  if left(ltrim(@body), 1) <> N'[' return 0;
  if exists (
    select 1
    from openjson(@body) as prvek
    where prvek.[type] <> 5
       or json_value(prvek.[value], N'$.nazev') is null
       or len(ltrim(rtrim(json_value(prvek.[value], N'$.nazev')))) = 0
       or json_value(prvek.[value], N'$.typ') is null
       or json_value(prvek.[value], N'$.typ') not in (N'hodnota', N'ano_ne')
       or (
         json_value(prvek.[value], N'$.typ') = N'hodnota'
         and (
           exists (select 1 from openjson(prvek.[value]) k
                   where k.[key] collate Latin1_General_BIN2 = N'hodnota' and k.[type] not in (0, 2))
           or exists (select 1 from openjson(prvek.[value]) k
                      where k.[key] collate Latin1_General_BIN2 = N'ano')
         )
       )
       or (
         json_value(prvek.[value], N'$.typ') = N'ano_ne'
         and (
           exists (select 1 from openjson(prvek.[value]) k
                   where k.[key] collate Latin1_General_BIN2 = N'ano' and k.[type] not in (0, 3))
           or exists (select 1 from openjson(prvek.[value]) k
                      where k.[key] collate Latin1_General_BIN2 = N'hodnota')
         )
       )
  ) return 0;
  return 1;
end;
GO

-- Jen zadání bodů (nazev, typ) v původním pořadí, bez odpovědí - trigger tím
-- porovnává, jestli technik nezměnil otázku místo odpovědi. Prázdné -> [].
-- FOR JSON místo string_agg: ten má až SQL Server 2017.
create function dbo.zadani_kontrolnich_bodu(@body nvarchar(max))
returns nvarchar(max)
with schemabinding
as
begin
  if @body is null or isjson(@body) <> 1 return N'[]';
  return isnull((
    select json_value(prvek.[value], N'$.nazev') as nazev,
           json_value(prvek.[value], N'$.typ')   as typ
    from openjson(@body) as prvek
    order by cast(prvek.[key] as int)
    for json path, include_null_values
  ), N'[]');
end;
GO

-- -----------------------------------------------------------------------------
-- Identita a oprávnění (dřív migrace 0001, 0024)
-- -----------------------------------------------------------------------------

-- Oblasti údržby jsou data, ne výčet v kódu (R2).
create table dbo.oblast (
  id           uniqueidentifier not null constraint df_oblast_id default newid(),
  kod          nvarchar(60)     not null,
  nazev        nvarchar(200)    not null,
  poradi       int              not null constraint df_oblast_poradi default 0,
  aktivni      bit              not null constraint df_oblast_aktivni default 1,
  vytvoreno_at datetime2(3)     not null constraint df_oblast_vytvoreno default sysutcdatetime(),
  zmeneno_at   datetime2(3)     not null constraint df_oblast_zmeneno default sysutcdatetime(),
  constraint oblast_pkey primary key (id),
  constraint oblast_kod_key unique (kod)
);
GO

create table dbo.[role] (
  id     uniqueidentifier not null constraint df_role_id default newid(),
  kod    nvarchar(60)     not null,
  nazev  nvarchar(200)    not null,
  popis  nvarchar(max)    null,
  poradi int              not null constraint df_role_poradi default 0,
  constraint role_pkey primary key (id),
  constraint role_kod_key unique (kod)
);
GO

-- Strom umístění: areál -> hala -> provoz.
create table dbo.umisteni (
  id           uniqueidentifier not null constraint df_umisteni_id default newid(),
  kod          nvarchar(60)     not null,
  nazev        nvarchar(200)    not null,
  nadrazene_id uniqueidentifier null,
  vytvoreno_at datetime2(3)     not null constraint df_umisteni_vytvoreno default sysutcdatetime(),
  zmeneno_at   datetime2(3)     not null constraint df_umisteni_zmeneno default sysutcdatetime(),
  constraint umisteni_pkey primary key (id),
  constraint umisteni_kod_key unique (kod),
  constraint umisteni_nadrazene_id_fkey foreign key (nadrazene_id) references dbo.umisteni (id),
  constraint ck_umisteni_neni_sam_sobe_nadrazen check (id <> nadrazene_id)
);
create index umisteni_nadrazene_idx on dbo.umisteni (nadrazene_id);
GO

-- OSOBA, ne účet. Kancelář se přihlašuje heslem ze ZAKMATu (podle osobního
-- čísla; při vývoji z dbo.prihlaseni), dílna na tabletu PINem (dbo.pin).
-- Sloupec ucet_id ze Supabase zmizel.
create table dbo.profil (
  id               uniqueidentifier not null constraint df_profil_id default newid(),
  jmeno            nvarchar(100)    not null constraint df_profil_jmeno default N'',
  prijmeni         nvarchar(100)    not null constraint df_profil_prijmeni default N'',
  -- ZAKMAT vede OS_CISLO jako int (0-999996); stejny typ, aby se osoby
  -- daly parovat bez prevodu a bez stretu kolaci pri dotazu pres databaze.
  osobni_cislo     int              null,
  email            nvarchar(254)    null,
  aktivni          bit              not null constraint df_profil_aktivni default 1,
  -- Relace vydané dřív neplatí (změna hesla, vyřazení). NULL = bez omezení.
  relace_platne_od datetime2(3)     null,
  vytvoreno_at     datetime2(3)     not null constraint df_profil_vytvoreno default sysutcdatetime(),
  zmeneno_at       datetime2(3)     not null constraint df_profil_zmeneno default sysutcdatetime(),
  constraint profil_pkey primary key (id)
);
-- Unikáty s více NULL: v SQL Serveru přes filtrovaný index. E-mail bez
-- ohledu na velikost písmen zajistí kolace databáze (SQL_Czech_CP1250_CI_AS).
create unique index profil_osobni_cislo_key on dbo.profil (osobni_cislo) where osobni_cislo is not null;
create unique index profil_email_idx        on dbo.profil (email)        where email is not null;
GO

-- Hesla stranou od profilu: aplikační účet na tuhle tabulku nemá žádné právo,
-- čte ji jen procedura nacti_prihlaseni a zapisuje nastav_heslo (0004).
create table dbo.prihlaseni (
  profil_id  uniqueidentifier not null,
  heslo_hash nvarchar(300)    not null,
  zmeneno_at datetime2(3)     not null constraint df_prihlaseni_zmeneno default sysutcdatetime(),
  constraint prihlaseni_pkey primary key (profil_id),
  constraint prihlaseni_profil_id_fkey foreign key (profil_id) references dbo.profil (id)
);
GO

create table dbo.uzivatel_role (
  uzivatel_id uniqueidentifier not null,
  role_id     uniqueidentifier not null,
  constraint uzivatel_role_pkey primary key (uzivatel_id, role_id),
  constraint uzivatel_role_uzivatel_id_fkey foreign key (uzivatel_id) references dbo.profil (id),
  constraint uzivatel_role_role_id_fkey     foreign key (role_id)     references dbo.[role] (id)
);
GO

create table dbo.uzivatel_oblast (
  uzivatel_id uniqueidentifier not null,
  oblast_id   uniqueidentifier not null,
  vztah       nvarchar(30)     not null constraint df_uzivatel_oblast_vztah default N'spolupracujici',
  constraint uzivatel_oblast_pkey primary key (uzivatel_id, oblast_id),
  constraint uzivatel_oblast_uzivatel_id_fkey foreign key (uzivatel_id) references dbo.profil (id),
  constraint uzivatel_oblast_oblast_id_fkey   foreign key (oblast_id)   references dbo.oblast (id) on delete cascade,
  constraint ck_uzivatel_oblast_vztah check (vztah in (N'garant', N'spolupracujici'))
);
create index uzivatel_oblast_oblast_idx on dbo.uzivatel_oblast (oblast_id);
GO

-- -----------------------------------------------------------------------------
-- Dílna na tabletu (rozhodnuto 25. 9. 2026, docs/NAVRH.md kap. 8)
--
-- Dělník se na registrovaném tabletu vybere ze seznamu a potvrdí PINem. Karty
-- ani role kiosek už nejsou. Na tyhle tři tabulky nemá aplikace žádné právo
-- (R3) - čtou a píšou je jen procedury z 0004, takže hash PINu ani token tabletu
-- databázi neopustí.
-- -----------------------------------------------------------------------------

-- Tablet, na kterém se smí přihlašovat PINem. Uložený je jen SHA-256 tajného
-- tokenu; token sám zná jen cookie tabletu, takže únik databáze ho neprozradí.
-- Tablet se neruší smazáním, ale aktivni = 0 (audit ví, kdo co kdy zrušil).
create table dbo.tablet (
  id           uniqueidentifier not null constraint df_tablet_id default newid(),
  nazev        nvarchar(100)    not null,
  token_hash   binary(32)       not null,
  aktivni      bit              not null constraint df_tablet_aktivni default 1,
  vytvoril_id  uniqueidentifier null,
  naposledy_at datetime2(3)     null,
  vytvoreno_at datetime2(3)     not null constraint df_tablet_vytvoreno default sysutcdatetime(),
  zmeneno_at   datetime2(3)     not null constraint df_tablet_zmeneno default sysutcdatetime(),
  constraint tablet_pkey primary key (id),
  constraint tablet_token_hash_key unique (token_hash),
  constraint tablet_vytvoril_id_fkey foreign key (vytvoril_id) references dbo.profil (id),
  constraint ck_tablet_nazev_neni_prazdny check (len(ltrim(rtrim(nazev))) > 0)
);
GO

-- PIN osoby. hash = SHA2-512(sůl + PIN), viz dbo.hash_pinu (0002). Čtyřmístný
-- PIN má jen 10 000 kombinací, takže hash sám nechrání - chrání to, že tabulku
-- nikdo mimo procedury nevidí, a zámek: 5 chyb = 15 minut, 10 chyb = natrvalo,
-- dokud admin neodemkne. Bez auditního triggeru (hash do audit_log nepatří);
-- nastavení, odemčení a zamčení zapisují procedury do auditu samy.
create table dbo.pin (
  profil_id      uniqueidentifier not null,
  sul            binary(16)       not null,
  hash           binary(64)       not null,
  musi_zmenit    bit              not null constraint df_pin_musi_zmenit default 1,
  chyb           int              not null constraint df_pin_chyb default 0,
  zamceno_do     datetime2(3)     null,
  zamceno_trvale bit              not null constraint df_pin_zamceno_trvale default 0,
  zmeneno_at     datetime2(3)     not null constraint df_pin_zmeneno default sysutcdatetime(),
  constraint pin_pkey primary key (profil_id),
  constraint pin_profil_id_fkey foreign key (profil_id) references dbo.profil (id),
  constraint ck_pin_chyb_nezaporne check (chyb >= 0)
);
GO

-- Zámek přihlášení heslem (kancelář). Klíčem je zadané přihlašovací jméno
-- v normalizovaném tvaru, ne osoba - zamyká se i jméno, které neexistuje, ať
-- z odpovědi nejde poznat, kdo účet má. 5 chyb = 15 minut, bez trvalého zámku
-- (heslo spravuje ZAKMAT a trvalé zamčení by šlo zneužít k vyřazení kanceláře).
create table dbo.pokus_hesla (
  jmeno      nvarchar(254) not null,
  chyb       int           not null constraint df_pokus_hesla_chyb default 0,
  zamceno_do datetime2(3)  null,
  zmeneno_at datetime2(3)  not null constraint df_pokus_hesla_zmeneno default sysutcdatetime(),
  constraint pokus_hesla_pkey primary key (jmeno)
);
GO

-- Audit plní výhradně triggery (0003); aplikační účet má jen SELECT.
create table dbo.audit_log (
  id          bigint           not null identity(1, 1),
  tabulka     nvarchar(128)    not null,
  zaznam_id   nvarchar(100)    not null,
  operace     nvarchar(10)     not null,
  stary_stav  nvarchar(max)    null,
  novy_stav   nvarchar(max)    null,
  uzivatel_id uniqueidentifier null,   -- záměrně bez cizího klíče; NULL = systém
  cas         datetime2(3)     not null constraint df_audit_log_cas default sysutcdatetime(),
  constraint audit_log_pkey primary key (id),
  constraint ck_audit_log_operace check (operace in (N'INSERT', N'UPDATE', N'DELETE')),
  constraint ck_audit_log_stary_stav_json check (stary_stav is null or isjson(stary_stav) = 1),
  constraint ck_audit_log_novy_stav_json  check (novy_stav  is null or isjson(novy_stav)  = 1)
);
create index audit_log_zaznam_idx on dbo.audit_log (tabulka, zaznam_id);
create index audit_log_cas_idx    on dbo.audit_log (cas desc);
GO

-- Běhy nočního plánovače (náhrada za cron.job_run_details).
create table dbo.planovac_beh (
  id      bigint        not null identity(1, 1),
  zacatek datetime2(3)  not null constraint df_planovac_beh_zacatek default sysutcdatetime(),
  konec   datetime2(3)  null,
  pocet   int           null,
  chyba   nvarchar(max) null,
  constraint planovac_beh_pkey primary key (id)
);
GO

-- -----------------------------------------------------------------------------
-- Zařízení (dřív migrace 0003, 0005, 0006)
-- -----------------------------------------------------------------------------

create table dbo.typ_zarizeni (
  id               uniqueidentifier not null constraint df_typ_zarizeni_id default newid(),
  oblast_id        uniqueidentifier not null,
  kod              nvarchar(60)     not null,
  nazev            nvarchar(200)    not null,
  popis            nvarchar(max)    null,
  schema_parametru nvarchar(max)    not null constraint df_typ_zarizeni_schema default N'{}',
  aktivni          bit              not null constraint df_typ_zarizeni_aktivni default 1,
  vytvoreno_at     datetime2(3)     not null constraint df_typ_zarizeni_vytvoreno default sysutcdatetime(),
  zmeneno_at       datetime2(3)     not null constraint df_typ_zarizeni_zmeneno default sysutcdatetime(),
  constraint typ_zarizeni_pkey primary key (id),
  constraint typ_zarizeni_kod_key unique (kod),
  constraint typ_zarizeni_oblast_id_fkey foreign key (oblast_id) references dbo.oblast (id),
  constraint ck_typ_zarizeni_nazev_neni_prazdny check (len(ltrim(rtrim(nazev))) > 0),
  constraint ck_typ_zarizeni_schema_json check (isjson(schema_parametru) = 1),
  constraint ck_typ_zarizeni_schema_ma_platny_tvar check (dbo.je_platne_schema_parametru(schema_parametru) = 1),
  -- Nadbytečný unikát jako cíl složeného cizího klíče (typ a stroj ve stejné oblasti).
  constraint typ_zarizeni_id_oblast_unique unique (id, oblast_id)
);
create index typ_zarizeni_oblast_idx on dbo.typ_zarizeni (oblast_id);
GO

create table dbo.zarizeni (
  id                 uniqueidentifier not null constraint df_zarizeni_id default newid(),
  oblast_id          uniqueidentifier not null,
  typ_zarizeni_id    uniqueidentifier not null,
  nazev              nvarchar(200)    not null,
  inventarni_cislo   nvarchar(60)     null,
  vyrobce            nvarchar(200)    null,
  model              nvarchar(200)    null,
  vyrobni_cislo      nvarchar(200)    null,
  rok_vyroby         smallint         null,
  umisteni_id        uniqueidentifier null,
  odpovedna_osoba_id uniqueidentifier null,
  stav               nvarchar(30)     not null constraint df_zarizeni_stav default N'v_provozu',
  parametry          nvarchar(max)    not null constraint df_zarizeni_parametry default N'{}',
  poznamka           nvarchar(max)    null,
  vytvoreno_at       datetime2(3)     not null constraint df_zarizeni_vytvoreno default sysutcdatetime(),
  zmeneno_at         datetime2(3)     not null constraint df_zarizeni_zmeneno default sysutcdatetime(),
  constraint zarizeni_pkey primary key (id),
  constraint zarizeni_oblast_id_fkey   foreign key (oblast_id)   references dbo.oblast   (id),
  constraint zarizeni_umisteni_id_fkey foreign key (umisteni_id) references dbo.umisteni (id),
  constraint zarizeni_odpovedna_osoba_id_fkey foreign key (odpovedna_osoba_id) references dbo.profil (id),
  -- Typ musí být ze stejné oblasti jako stroj: hlídá to složený klíč, ne trigger.
  constraint zarizeni_typ_ze_stejne_oblasti
    foreign key (typ_zarizeni_id, oblast_id) references dbo.typ_zarizeni (id, oblast_id),
  constraint ck_zarizeni_stav check (stav in (N'v_provozu', N'odstaveno', N'v_oprave', N'vyrazeno')),
  constraint ck_zarizeni_nazev_neni_prazdny check (len(ltrim(rtrim(nazev))) > 0),
  constraint ck_zarizeni_inventarni_cislo_neni_prazdne
    check (inventarni_cislo is null or len(ltrim(rtrim(inventarni_cislo))) > 0),
  constraint ck_zarizeni_rok_vyroby_v_rozsahu check (rok_vyroby is null or rok_vyroby between 1900 and 2200),
  constraint ck_zarizeni_parametry_jsou_objekt check (isjson(parametry) = 1 and left(ltrim(parametry), 1) = N'{'),
  constraint zarizeni_id_oblast_unique unique (id, oblast_id)
);
create unique index zarizeni_inventarni_cislo_key on dbo.zarizeni (inventarni_cislo) where inventarni_cislo is not null;
create index zarizeni_oblast_idx    on dbo.zarizeni (oblast_id);
create index zarizeni_typ_idx       on dbo.zarizeni (typ_zarizeni_id);
create index zarizeni_umisteni_idx  on dbo.zarizeni (umisteni_id);
create index zarizeni_odpovedny_idx on dbo.zarizeni (odpovedna_osoba_id);
create index zarizeni_stav_idx      on dbo.zarizeni (stav);
GO

-- Fotky, návody a certifikáty ke kartě stroje. Soubor sám leží na disku
-- (src/lib/storage), tady je jen metadata; cesta = <id zarizeni>/<uuid>.<ext>.
create table dbo.zarizeni_soubor (
  id           uniqueidentifier not null constraint df_zarizeni_soubor_id default newid(),
  zarizeni_id  uniqueidentifier not null,
  druh         nvarchar(30)     not null,
  nazev        nvarchar(200)    not null,
  cesta        nvarchar(400)    not null,
  mime         nvarchar(100)    null,
  velikost_b   bigint           null,
  nahral_id    uniqueidentifier null,
  vytvoreno_at datetime2(3)     not null constraint df_zarizeni_soubor_vytvoreno default sysutcdatetime(),
  constraint zarizeni_soubor_pkey primary key (id),
  constraint zarizeni_soubor_cesta_key unique (cesta),
  constraint zarizeni_soubor_zarizeni_id_fkey foreign key (zarizeni_id) references dbo.zarizeni (id) on delete cascade,
  constraint zarizeni_soubor_nahral_id_fkey   foreign key (nahral_id)   references dbo.profil (id),
  constraint ck_zarizeni_soubor_druh check (druh in (N'foto', N'navod', N'certifikat')),
  constraint ck_zarizeni_soubor_velikost_nezaporna check (velikost_b is null or velikost_b >= 0)
);
create index zarizeni_soubor_zarizeni_idx on dbo.zarizeni_soubor (zarizeni_id, druh);
GO

-- -----------------------------------------------------------------------------
-- Šablony údržby (dřív migrace 0006-0010)
-- -----------------------------------------------------------------------------

create table dbo.sablona (
  id           uniqueidentifier not null constraint df_sablona_id default newid(),
  oblast_id    uniqueidentifier not null,
  kod          nvarchar(60)     not null,
  nazev        nvarchar(200)    not null,
  popis        nvarchar(max)    null,
  aktivni      bit              not null constraint df_sablona_aktivni default 1,
  vytvoreno_at datetime2(3)     not null constraint df_sablona_vytvoreno default sysutcdatetime(),
  zmeneno_at   datetime2(3)     not null constraint df_sablona_zmeneno default sysutcdatetime(),
  constraint sablona_pkey primary key (id),
  constraint sablona_kod_key unique (kod),
  constraint sablona_oblast_id_fkey foreign key (oblast_id) references dbo.oblast (id),
  constraint ck_sablona_kod_neni_prazdny   check (len(ltrim(rtrim(kod))) > 0),
  constraint ck_sablona_nazev_neni_prazdny check (len(ltrim(rtrim(nazev))) > 0),
  constraint sablona_id_oblast_unique unique (id, oblast_id)
);
create index sablona_oblast_idx on dbo.sablona (oblast_id);
GO

-- Verze šablony: návrh -> aktivní -> archivovaná. Aktivovaná verze je
-- neměnná (R3), hlídá trigger. Nejvýš jeden návrh a jedna aktivní na šablonu.
create table dbo.sablona_verze (
  id                uniqueidentifier not null constraint df_sablona_verze_id default newid(),
  sablona_id        uniqueidentifier not null,
  cislo_verze       int              not null,
  stav              nvarchar(30)     not null constraint df_sablona_verze_stav default N'navrh',
  platna_od         datetime2(3)     null,
  vytvoril_id       uniqueidentifier null,
  poznamka_ke_zmene nvarchar(max)    null,
  vytvoreno_at      datetime2(3)     not null constraint df_sablona_verze_vytvoreno default sysutcdatetime(),
  constraint sablona_verze_pkey primary key (id),
  constraint sablona_verze_sablona_id_fkey foreign key (sablona_id) references dbo.sablona (id) on delete cascade,
  constraint sablona_verze_vytvoril_id_fkey foreign key (vytvoril_id) references dbo.profil (id),
  constraint ck_sablona_verze_stav check (stav in (N'navrh', N'aktivni', N'archivovana')),
  constraint ck_sablona_verze_cislo_kladne check (cislo_verze > 0),
  constraint sablona_verze_cislo_unique unique (sablona_id, cislo_verze),
  constraint ck_sablona_verze_platnost_jen_po_aktivaci
    check ((stav = N'navrh' and platna_od is null) or (stav <> N'navrh' and platna_od is not null))
);
create index sablona_verze_sablona_idx on dbo.sablona_verze (sablona_id, cislo_verze desc);
create unique index sablona_verze_jediny_navrh  on dbo.sablona_verze (sablona_id) where stav = N'navrh';
create unique index sablona_verze_jedina_aktivni on dbo.sablona_verze (sablona_id) where stav = N'aktivni';
GO

-- Řádek matice údržby. `klic` je totožnost úkonu napříč verzemi (plán údržby
-- se na něj váže, ne na id). Pořadí je unikátní na konci příkazu, takže
-- přeuspořádání jedním UPDATE projde bez odloženého omezení.
create table dbo.sablona_ukon (
  id               uniqueidentifier not null constraint df_sablona_ukon_id default newid(),
  sablona_verze_id uniqueidentifier not null,
  poradi           int              not null,
  nazev            nvarchar(200)    not null,
  popis            nvarchar(max)    null,
  interval_typ     nvarchar(30)     not null,
  interval_hodnota int              not null,
  interval_zaklad  nvarchar(30)     not null constraint df_sablona_ukon_zaklad default N'od_planu',
  tolerance_dny    int              not null constraint df_sablona_ukon_tolerance default 0,
  profese_role_id  uniqueidentifier not null,
  kontrolni_body   nvarchar(max)    not null constraint df_sablona_ukon_body default N'[]',
  vyzaduje_foto    bit              not null constraint df_sablona_ukon_foto default 0,
  vyzaduje_hodnotu bit              not null constraint df_sablona_ukon_hodnotu default 0,
  jednotka         nvarchar(30)     null,
  mez_min          decimal(18, 4)   null,
  mez_max          decimal(18, 4)   null,
  nabizi_poznamku  bit              not null constraint df_sablona_ukon_poznamku default 0,
  klic             uniqueidentifier not null constraint df_sablona_ukon_klic default newid(),
  vytvoreno_at     datetime2(3)     not null constraint df_sablona_ukon_vytvoreno default sysutcdatetime(),
  constraint sablona_ukon_pkey primary key (id),
  constraint sablona_ukon_sablona_verze_id_fkey foreign key (sablona_verze_id) references dbo.sablona_verze (id) on delete cascade,
  constraint sablona_ukon_profese_role_id_fkey  foreign key (profese_role_id)  references dbo.[role] (id),
  constraint ck_sablona_ukon_interval_typ    check (interval_typ in (N'dny', N'tydny', N'mesice', N'roky')),
  constraint ck_sablona_ukon_interval_zaklad check (interval_zaklad in (N'od_provedeni', N'od_planu')),
  constraint ck_sablona_ukon_nazev_neni_prazdny  check (len(ltrim(rtrim(nazev))) > 0),
  constraint ck_sablona_ukon_interval_kladny     check (interval_hodnota > 0),
  constraint ck_sablona_ukon_tolerance_nezaporna check (tolerance_dny >= 0),
  constraint ck_sablona_ukon_kontrolni_body_jsou_pole
    check (isjson(kontrolni_body) = 1 and left(ltrim(kontrolni_body), 1) = N'['),
  constraint ck_sablona_ukon_kontrolni_body_maji_tvar check (dbo.jsou_platne_kontrolni_body(kontrolni_body) = 1),
  constraint ck_sablona_ukon_mereni_ma_jednotku   check (vyzaduje_hodnotu = 0 or jednotka is not null),
  constraint ck_sablona_ukon_meze_jen_pri_mereni
    check (vyzaduje_hodnotu = 1 or (jednotka is null and mez_min is null and mez_max is null)),
  constraint ck_sablona_ukon_meze_ve_spravnem_poradi
    check (mez_min is null or mez_max is null or mez_min <= mez_max),
  constraint sablona_ukon_poradi_unique unique (sablona_verze_id, poradi),
  constraint sablona_ukon_klic_unique   unique (sablona_verze_id, klic)
);
create index sablona_ukon_verze_idx   on dbo.sablona_ukon (sablona_verze_id, poradi);
create index sablona_ukon_profese_idx on dbo.sablona_ukon (profese_role_id);
GO

-- Přiřazení šablony stroji. oblast_id je záměrná denormalizace: složené klíče
-- pohlídají, že stroj i šablona jsou z téže oblasti.
create table dbo.zarizeni_sablona (
  zarizeni_id  uniqueidentifier not null,
  sablona_id   uniqueidentifier not null,
  oblast_id    uniqueidentifier not null,
  prirazeno_od date             not null constraint df_zarizeni_sablona_od default dbo.dnes(),
  prirazil_id  uniqueidentifier null,
  vytvoreno_at datetime2(3)     not null constraint df_zarizeni_sablona_vytvoreno default sysutcdatetime(),
  constraint zarizeni_sablona_pkey primary key (zarizeni_id, sablona_id),
  constraint zarizeni_sablona_zarizeni_fk
    foreign key (zarizeni_id, oblast_id) references dbo.zarizeni (id, oblast_id) on delete cascade,
  constraint zarizeni_sablona_sablona_fk
    foreign key (sablona_id, oblast_id) references dbo.sablona (id, oblast_id),
  constraint zarizeni_sablona_prirazil_id_fkey foreign key (prirazil_id) references dbo.profil (id)
);
create index zarizeni_sablona_sablona_idx on dbo.zarizeni_sablona (sablona_id);
GO

-- Živý stav plánovače: stroj × úkon -> další termín. ukon_klic míří na
-- sablona_ukon.klic bez cizího klíče (klíč je unikátní jen v rámci verze);
-- vztah drží procedura srovnej_plan.
create table dbo.plan_udrzby (
  id                    uniqueidentifier not null constraint df_plan_udrzby_id default newid(),
  zarizeni_id           uniqueidentifier not null,
  sablona_id            uniqueidentifier not null,
  ukon_klic             uniqueidentifier not null,
  dalsi_termin          date             null,
  posledni_provedeno_at datetime2(3)     null,
  aktivni               bit              not null constraint df_plan_udrzby_aktivni default 1,
  vytvoreno_at          datetime2(3)     not null constraint df_plan_udrzby_vytvoreno default sysutcdatetime(),
  zmeneno_at            datetime2(3)     not null constraint df_plan_udrzby_zmeneno default sysutcdatetime(),
  constraint plan_udrzby_pkey primary key (id),
  constraint plan_udrzby_ukon_unique unique (zarizeni_id, sablona_id, ukon_klic),
  constraint plan_udrzby_prirazeni_fk
    foreign key (zarizeni_id, sablona_id) references dbo.zarizeni_sablona (zarizeni_id, sablona_id) on delete cascade
);
create index plan_udrzby_termin_idx   on dbo.plan_udrzby (dalsi_termin) where aktivni = 1 and dalsi_termin is not null;
create index plan_udrzby_zarizeni_idx on dbo.plan_udrzby (zarizeni_id);
create index plan_udrzby_sablona_idx  on dbo.plan_udrzby (sablona_id);
GO

-- -----------------------------------------------------------------------------
-- Zakázky (dřív migrace 0011-0017)
-- -----------------------------------------------------------------------------

-- Jedna cesta technika ke stroji: stroj + termín + profese. Zmrazí verzi
-- šablony (R3). Uzavřená je neměnná, hlídá trigger.
create table dbo.zakazka (
  id                     uniqueidentifier not null constraint df_zakazka_id default newid(),
  zarizeni_id            uniqueidentifier not null,
  sablona_verze_id       uniqueidentifier not null,
  profese_role_id        uniqueidentifier not null,
  planovany_termin       date             not null,
  stav                   nvarchar(30)     not null constraint df_zakazka_stav default N'naplanovano',
  prirazeno_uzivateli_id uniqueidentifier null,
  zahajeno_at            datetime2(3)     null,
  dokonceno_at           datetime2(3)     null,
  dokoncil_id            uniqueidentifier null,
  poznamka               nvarchar(max)    null,
  vytvoreno_at           datetime2(3)     not null constraint df_zakazka_vytvoreno default sysutcdatetime(),
  zmeneno_at             datetime2(3)     not null constraint df_zakazka_zmeneno default sysutcdatetime(),
  constraint zakazka_pkey primary key (id),
  constraint zakazka_zarizeni_id_fkey      foreign key (zarizeni_id)      references dbo.zarizeni (id),
  constraint zakazka_sablona_verze_id_fkey foreign key (sablona_verze_id) references dbo.sablona_verze (id),
  constraint zakazka_profese_role_id_fkey  foreign key (profese_role_id)  references dbo.[role] (id),
  constraint zakazka_prirazeno_uzivateli_id_fkey foreign key (prirazeno_uzivateli_id) references dbo.profil (id),
  constraint zakazka_dokoncil_id_fkey      foreign key (dokoncil_id)      references dbo.profil (id),
  constraint ck_zakazka_stav check (stav in (N'naplanovano', N'probiha', N'dokonceno', N'zruseno')),
  constraint ck_zakazka_dokonceni_je_uplne
    check ((stav = N'dokonceno' and dokonceno_at is not null) or (stav <> N'dokonceno' and dokonceno_at is null)),
  constraint ck_zakazka_zahajeni_pred_dokoncenim
    check (zahajeno_at is null or dokonceno_at is null or zahajeno_at <= dokonceno_at)
);
-- Jedna otevřená zakázka na stroj, den, profesi a verzi - plánovač je idempotentní.
create unique index zakazka_skupina_unique
  on dbo.zakazka (zarizeni_id, planovany_termin, profese_role_id, sablona_verze_id)
  where stav in (N'naplanovano', N'probiha');
create index zakazka_zarizeni_idx  on dbo.zakazka (zarizeni_id, planovany_termin desc);
create index zakazka_prirazeno_idx on dbo.zakazka (prirazeno_uzivateli_id) where stav in (N'naplanovano', N'probiha');
create index zakazka_otevrene_idx  on dbo.zakazka (planovany_termin)       where stav in (N'naplanovano', N'probiha');
GO

-- Krok checklistu. Snímky (*_snapshot) jsou kopie z matice v okamžiku
-- naplánování; kontrolni_body nesou otázky i odpovědi v jednom poli.
create table dbo.zakazka_ukon (
  id                     uniqueidentifier not null constraint df_zakazka_ukon_id default newid(),
  zakazka_id             uniqueidentifier not null,
  plan_udrzby_id         uniqueidentifier null,
  sablona_ukon_id        uniqueidentifier null,
  poradi                 int              not null,
  nazev_snapshot         nvarchar(200)    not null,
  popis_snapshot         nvarchar(max)    null,
  kontrolni_body         nvarchar(max)    not null constraint df_zakazka_ukon_body default N'[]',
  vyzaduje_foto          bit              not null constraint df_zakazka_ukon_foto default 0,
  vyzaduje_hodnotu       bit              not null constraint df_zakazka_ukon_hodnotu default 0,
  nabizi_poznamku        bit              not null constraint df_zakazka_ukon_poznamku default 0,
  jednotka_snapshot      nvarchar(30)     null,
  mez_min_snapshot       decimal(18, 4)   null,
  mez_max_snapshot       decimal(18, 4)   null,
  tolerance_dny_snapshot int              not null constraint df_zakazka_ukon_tolerance default 0,
  stav                   nvarchar(30)     not null constraint df_zakazka_ukon_stav default N'nesplneno',
  hodnota                decimal(18, 4)   null,
  poznamka               nvarchar(max)    null,
  potvrzeno_at           datetime2(3)     null,
  potvrdil_id            uniqueidentifier null,
  vytvoreno_at           datetime2(3)     not null constraint df_zakazka_ukon_vytvoreno default sysutcdatetime(),
  constraint zakazka_ukon_pkey primary key (id),
  constraint zakazka_ukon_zakazka_id_fkey      foreign key (zakazka_id)      references dbo.zakazka (id) on delete cascade,
  constraint zakazka_ukon_plan_udrzby_id_fkey  foreign key (plan_udrzby_id)  references dbo.plan_udrzby (id) on delete set null,
  constraint zakazka_ukon_sablona_ukon_id_fkey foreign key (sablona_ukon_id) references dbo.sablona_ukon (id) on delete set null,
  constraint zakazka_ukon_potvrdil_id_fkey     foreign key (potvrdil_id)     references dbo.profil (id),
  constraint ck_zakazka_ukon_stav check (stav in (N'nesplneno', N'splneno', N'nelze_provest')),
  constraint ck_zakazka_ukon_nazev_neni_prazdny check (len(ltrim(rtrim(nazev_snapshot))) > 0),
  constraint ck_zakazka_ukon_body_json check (isjson(kontrolni_body) = 1 and left(ltrim(kontrolni_body), 1) = N'['),
  constraint ck_zakazka_ukon_body_maji_platny_tvar check (dbo.jsou_platne_odpovedi_bodu(kontrolni_body) = 1),
  constraint zakazka_ukon_poradi_unique unique (zakazka_id, poradi),
  constraint ck_zakazka_ukon_potvrzeni_sedi_se_stavem
    check ((stav = N'nesplneno' and potvrzeno_at is null) or (stav <> N'nesplneno' and potvrzeno_at is not null)),
  constraint ck_zakazka_ukon_duvod_pri_neprovedeni
    check (stav <> N'nelze_provest' or len(ltrim(rtrim(isnull(poznamka, N'')))) > 0),
  constraint ck_zakazka_ukon_mereni_ma_hodnotu
    check (not (stav = N'splneno' and vyzaduje_hodnotu = 1 and hodnota is null)),
  constraint ck_zakazka_ukon_tolerance_nezaporna check (tolerance_dny_snapshot >= 0)
);
-- Jeden krok na plán v zakázce; kroky bez plánu (NULL) mohou být v zakázce víckrát.
create unique index zakazka_ukon_plan_unique on dbo.zakazka_ukon (zakazka_id, plan_udrzby_id) where plan_udrzby_id is not null;
create index zakazka_ukon_zakazka_idx on dbo.zakazka_ukon (zakazka_id, poradi);
create index zakazka_ukon_plan_idx    on dbo.zakazka_ukon (plan_udrzby_id);
GO

-- Fotodokumentace kroku; cesta = <id zakazky>/<uuid>.<ext>.
create table dbo.zakazka_foto (
  id              uniqueidentifier not null constraint df_zakazka_foto_id default newid(),
  zakazka_ukon_id uniqueidentifier not null,
  storage_path    nvarchar(400)    not null,
  popis           nvarchar(max)    null,
  nahral_id       uniqueidentifier null,
  vytvoreno_at    datetime2(3)     not null constraint df_zakazka_foto_vytvoreno default sysutcdatetime(),
  constraint zakazka_foto_pkey primary key (id),
  constraint zakazka_foto_storage_path_key unique (storage_path),
  constraint zakazka_foto_zakazka_ukon_id_fkey foreign key (zakazka_ukon_id) references dbo.zakazka_ukon (id) on delete cascade,
  constraint zakazka_foto_nahral_id_fkey foreign key (nahral_id) references dbo.profil (id),
  constraint ck_zakazka_foto_cesta_neni_prazdna check (len(ltrim(rtrim(storage_path))) > 0)
);
create index zakazka_foto_ukon_idx on dbo.zakazka_foto (zakazka_ukon_id);
GO

-- -----------------------------------------------------------------------------
-- Provozní deník (dřív migrace 0020-0022)
-- -----------------------------------------------------------------------------

create table dbo.druh_zasahu (
  id           uniqueidentifier not null constraint df_druh_zasahu_id default newid(),
  kod          nvarchar(60)     not null,
  nazev        nvarchar(200)    not null,
  poradi       int              not null constraint df_druh_zasahu_poradi default 0,
  aktivni      bit              not null constraint df_druh_zasahu_aktivni default 1,
  vytvoreno_at datetime2(3)     not null constraint df_druh_zasahu_vytvoreno default sysutcdatetime(),
  zmeneno_at   datetime2(3)     not null constraint df_druh_zasahu_zmeneno default sysutcdatetime(),
  constraint druh_zasahu_pkey primary key (id),
  constraint druh_zasahu_kod_key unique (kod),
  constraint ck_druh_zasahu_kod_neni_prazdny   check (len(ltrim(rtrim(kod))) > 0),
  constraint ck_druh_zasahu_nazev_neni_prazdny check (len(ltrim(rtrim(nazev))) > 0)
);
GO

-- Neplánovaný zásah. „provedl" ≠ „zapsal": obojí výchozí na přihlášenou osobu.
-- Deník plán údržby neovlivňuje (R4). Datum zásahu nesmí být v budoucnosti,
-- hlídá trigger (CHECK nesmí použít aktuální čas).
create table dbo.provozni_denik (
  id              uniqueidentifier not null constraint df_provozni_denik_id default newid(),
  zarizeni_id     uniqueidentifier not null,
  oblast_id       uniqueidentifier not null,
  druh_zasahu_id  uniqueidentifier not null,
  popis           nvarchar(max)    not null,
  provedeno_at    datetime2(3)     not null constraint df_provozni_denik_provedeno default sysutcdatetime(),
  provedl_id      uniqueidentifier null constraint df_provozni_denik_provedl default dbo.aktualni_uzivatel(),
  doba_trvani_min int              null,
  zapsal_id       uniqueidentifier null constraint df_provozni_denik_zapsal default dbo.aktualni_uzivatel(),
  vytvoreno_at    datetime2(3)     not null constraint df_provozni_denik_vytvoreno default sysutcdatetime(),
  zmeneno_at      datetime2(3)     not null constraint df_provozni_denik_zmeneno default sysutcdatetime(),
  constraint provozni_denik_pkey primary key (id),
  constraint provozni_denik_zarizeni_fk
    foreign key (zarizeni_id, oblast_id) references dbo.zarizeni (id, oblast_id),
  constraint provozni_denik_druh_zasahu_id_fkey foreign key (druh_zasahu_id) references dbo.druh_zasahu (id),
  constraint provozni_denik_provedl_id_fkey foreign key (provedl_id) references dbo.profil (id),
  constraint provozni_denik_zapsal_id_fkey  foreign key (zapsal_id)  references dbo.profil (id),
  constraint ck_provozni_denik_popis_neni_prazdny check (len(ltrim(rtrim(popis))) > 0),
  constraint ck_provozni_denik_doba_je_rozumna check (doba_trvani_min is null or doba_trvani_min between 1 and 1440)
);
create index provozni_denik_zarizeni_idx on dbo.provozni_denik (zarizeni_id, provedeno_at desc);
create index provozni_denik_oblast_idx   on dbo.provozni_denik (oblast_id, provedeno_at desc);
create index provozni_denik_druh_idx     on dbo.provozni_denik (druh_zasahu_id);
create index provozni_denik_provedl_idx  on dbo.provozni_denik (provedl_id);
GO

create table dbo.denik_foto (
  id           uniqueidentifier not null constraint df_denik_foto_id default newid(),
  zaznam_id    uniqueidentifier not null,
  storage_path nvarchar(400)    not null,
  popis        nvarchar(max)    null,
  nahral_id    uniqueidentifier null,
  vytvoreno_at datetime2(3)     not null constraint df_denik_foto_vytvoreno default sysutcdatetime(),
  constraint denik_foto_pkey primary key (id),
  constraint denik_foto_storage_path_key unique (storage_path),
  constraint denik_foto_zaznam_id_fkey foreign key (zaznam_id) references dbo.provozni_denik (id) on delete cascade,
  constraint denik_foto_nahral_id_fkey foreign key (nahral_id) references dbo.profil (id),
  constraint ck_denik_foto_cesta_neni_prazdna check (len(ltrim(rtrim(storage_path))) > 0)
);
create index denik_foto_zaznam_idx on dbo.denik_foto (zaznam_id);
GO
