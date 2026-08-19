-- =============================================================================
-- M3 - Zakázky a checklist provedení
--
-- Odpovídá docs/NAVRH.md kap. 2.4. Zakázka je to, co technik otevře a odklikne;
-- zakazka_ukon je jeden krok jejího checklistu.
--
-- Návrh měl na zakázce zároveň plan_udrzby_id (tedy jeden úkon) i seznam
-- zakazka_ukon (tedy víc úkonů). To si odporuje a wireframe 5.3 rozhoduje ve
-- prospěch druhého: kroky checklistu mají vlastní kontrolní body, takže krok
-- je úkon z matice. Vazba na plán proto patří na krok, ne na zakázku.
--
-- Zbývalo doplnit, co úkony do jedné zakázky slučuje. Rozhodnutí uživatele
-- z 19. 8. 2026: stroj + termín + PROFESE. Skupina bez profese by u CNC matice
-- poslala dvě revize elektro do checklistu údržbáře CNC - dostal by krok, na
-- který nemá kvalifikaci. Se stejným datem a strojem tak vzniknou dvě zakázky,
-- každá pro svou profesi, a každá je jedna cesta ke stroji.
--
-- Druhé rozhodnutí: úkon po termínu nezakládá zakázku každý cyklus znovu.
-- Dokud ta stávající není hotová, další nevzniká - jen se u ní počítá zpoždění.
-- Vynucuje to plánovač v migraci 0013, tady jsou na to připravené indexy.
--
-- Čistý PostgreSQL. Fotky leží v Supabase Storage a to je jediná část, která
-- na Supabase závisí - proto je v samostatné migraci 0012 (PORTABILITA.md,
-- pravidlo 2).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Výčtové typy
-- -----------------------------------------------------------------------------

create type public.stav_zakazky as enum ('naplanovano', 'probiha', 'dokonceno', 'zruseno');

-- `nelze_provest` není totéž co nesplněno: technik u stroje byl, ale úkon
-- provést nešlo (stroj v opravě, chybí díl). Pro plnění matice v M4 je to jiný
-- případ než krok, ke kterému se nikdo nedostal.
create type public.stav_ukonu as enum ('nesplneno', 'splneno', 'nelze_provest');

-- -----------------------------------------------------------------------------
-- Tvar vyplněných kontrolních bodů
--
-- Zadání bodu i odpověď technika leží v jednom poli, ne ve dvou zarovnaných:
--   [{"nazev": "1000 ot.",      "typ": "hodnota", "hodnota": 4.2},
--    {"nazev": "Kryt dotažen",  "typ": "ano_ne",  "ano": true}]
--
-- Dvě pole vedle sebe by se musela držet ve stejném pořadí a při první
-- neshodě délek by odpovědi tiše sedly k jiným bodům. Takhle odpověď nemůže
-- od svého bodu odtéct.
--
-- Klíč s odpovědí smí chybět nebo být null - to je bod, který technik ještě
-- nevyplnil. Co ale nesmí, je odpověď špatného druhu: číslo u otázky ano/ne
-- nebo naopak. Autoritou je databáze, ne formulář - stejně jako u migrace 0007.
-- -----------------------------------------------------------------------------

create or replace function public.jsou_platne_odpovedi_bodu(p_body jsonb)
returns boolean
language sql
immutable
as $$
  select p_body is null or (
    jsonb_typeof(p_body) = 'array'
    and not exists (
      select 1
      from jsonb_array_elements(p_body) as prvek(bod)
      where jsonb_typeof(prvek.bod) <> 'object'
         or prvek.bod ->> 'nazev' is null
         or length(btrim(prvek.bod ->> 'nazev')) = 0
         or prvek.bod ->> 'typ' is null
         or prvek.bod ->> 'typ' not in ('hodnota', 'ano_ne')
         -- Odpověď musí odpovídat druhu bodu. Chybějící klíč je nevyplněný bod,
         -- proto coalesce na 'null' - bez něj by porovnání vyšlo NULL a řádek
         -- by propadl kontrolou bez povšimnutí.
         or (prvek.bod ->> 'typ' = 'hodnota'
             and (coalesce(jsonb_typeof(prvek.bod -> 'hodnota'), 'null')
                    not in ('number', 'null')
                  or prvek.bod ? 'ano'))
         or (prvek.bod ->> 'typ' = 'ano_ne'
             and (coalesce(jsonb_typeof(prvek.bod -> 'ano'), 'null')
                    not in ('boolean', 'null')
                  or prvek.bod ? 'hodnota'))
    )
  );
$$;

comment on function public.jsou_platne_odpovedi_bodu is
  'Ověří tvar vyplněných kontrolních bodů zakázky: zadání bodu i odpověď správného druhu.';

-- Zadání bodu bez odpovědí. Slouží k porovnání, že technik při vyplňování
-- nezměnil, na co se ho matice ptala - viz zámek níž.
create or replace function public.zadani_kontrolnich_bodu(p_body jsonb)
returns jsonb
language sql
immutable
as $$
  select coalesce(
    (
      select jsonb_agg(
               jsonb_build_object('nazev', prvek.bod ->> 'nazev', 'typ', prvek.bod ->> 'typ')
               order by prvek.poradi
             )
      from jsonb_array_elements(p_body) with ordinality as prvek(bod, poradi)
    ),
    '[]'::jsonb
  );
$$;

-- -----------------------------------------------------------------------------
-- Zakázka
--
-- sablona_verze_id je jádro rozhodnutí R3: zakázka ukazuje na KONKRÉTNÍ verzi,
-- kdežto zařízení na šablonu. Úprava šablony se tedy projeví u dalších zakázek,
-- ale nikdy nepřepíše, co technik odškrtal.
--
-- Zakázky vznikají výhradně plánovačem. Neplánovaný zásah není zakázka bez
-- matice - patří do provozního deníku (zadání ř. 137-144), a proto tu není
-- právo INSERT ani pro garanta.
-- -----------------------------------------------------------------------------

create table public.zakazka (
  id                     uuid primary key default gen_random_uuid(),
  zarizeni_id            uuid not null references public.zarizeni (id) on delete restrict,
  sablona_verze_id       uuid not null references public.sablona_verze (id) on delete restrict,
  -- Profese, která zakázku dělá. Sem se propisuje profese úkonů, ne role
  -- konkrétního člověka - ten se přiřazuje zvlášť a může se měnit.
  profese_role_id        uuid not null references public.role (id) on delete restrict,
  planovany_termin       date not null,
  stav                   public.stav_zakazky not null default 'naplanovano',
  prirazeno_uzivateli_id uuid references public.profil (id) on delete set null,
  zahajeno_at            timestamptz,
  dokonceno_at           timestamptz,
  dokoncil_id            uuid references public.profil (id) on delete set null,
  poznamka               text,
  vytvoreno_at           timestamptz not null default now(),
  zmeneno_at             timestamptz not null default now(),
  constraint zakazka_dokonceni_je_uplne
    check ((stav = 'dokonceno') = (dokonceno_at is not null)),
  constraint zakazka_zahajeni_pred_dokoncenim
    check (zahajeno_at is null or dokonceno_at is null or zahajeno_at <= dokonceno_at)
);

-- Skupina zakázky: stroj + termín + profese. Zrušené se do ní nepočítají, aby
-- šlo po zrušení naplánovat znovu.
--
-- POZOR: migrace 0013 tenhle index nahrazuje. Vylučovat jen zrušené nestačí -
-- dokončená zakázka by klíč skupiny držela dál a úkon, kterému garant nastaví
-- tentýž termín až potom, by neměl kam přijít. Důvod je celý rozepsaný tam.
create unique index zakazka_skupina_unique
  on public.zakazka (zarizeni_id, planovany_termin, profese_role_id)
  where stav <> 'zruseno';

create index zakazka_zarizeni_idx  on public.zakazka (zarizeni_id, planovany_termin desc);
create index zakazka_prirazeno_idx on public.zakazka (prirazeno_uzivateli_id)
  where stav in ('naplanovano', 'probiha');

-- Podklad pro dnešní plán a přehled po termínu (M4). Dokončené zakázky
-- do těch obrazovek nepatří, proto částečný index.
create index zakazka_otevrene_idx on public.zakazka (planovany_termin)
  where stav in ('naplanovano', 'probiha');

comment on table public.zakazka is
  'Jedna cesta technika ke stroji: úkony jednoho stroje splatné k témuž dni pro tutéž profesi.';

comment on column public.zakazka.sablona_verze_id is
  'Verze matice, podle které se zakázka dělá. Zamrazená (R3) - pozdější úprava šablony ji nepřepíše.';

-- -----------------------------------------------------------------------------
-- Úkon zakázky = jeden krok checklistu
--
-- Sloupce se sufixem _snapshot jsou kopie z matice pořízené při založení
-- zakázky. Vypadá to jako duplicita proti sablona_ukon, ale není: odkaz sám
-- o sobě nestačí, protože šablonu jde odebrat stroji a starou verzi archivovat,
-- a historie musí zůstat čitelná i pak. Odkazy proto smějí zplanět na null,
-- text kroku ne.
-- -----------------------------------------------------------------------------

create table public.zakazka_ukon (
  id                      uuid primary key default gen_random_uuid(),
  zakazka_id              uuid not null references public.zakazka (id) on delete cascade,
  -- Kudy se po dokončení vrátit do plánu a posunout termín. Null u kroku,
  -- jehož plán mezitím zanikl (šablona odebraná stroji) - krok tím nemizí.
  plan_udrzby_id          uuid references public.plan_udrzby (id) on delete set null,
  sablona_ukon_id         uuid references public.sablona_ukon (id) on delete set null,
  poradi                  integer not null,
  nazev_snapshot          text not null,
  popis_snapshot          text,
  kontrolni_body          jsonb not null default '[]'::jsonb,
  vyzaduje_foto           boolean not null default false,
  vyzaduje_hodnotu        boolean not null default false,
  nabizi_poznamku         boolean not null default false,
  jednotka_snapshot       text,
  mez_min_snapshot        numeric,
  mez_max_snapshot        numeric,
  stav                    public.stav_ukonu not null default 'nesplneno',
  hodnota                 numeric,
  poznamka                text,
  potvrzeno_at            timestamptz,
  potvrdil_id             uuid references public.profil (id) on delete set null,
  vytvoreno_at            timestamptz not null default now(),
  constraint zakazka_ukon_nazev_neni_prazdny check (length(btrim(nazev_snapshot)) > 0),
  constraint zakazka_ukon_body_maji_platny_tvar
    check (public.jsou_platne_odpovedi_bodu(kontrolni_body)),
  -- Jeden úkon plánu smí být v jedné zakázce nejvýš jednou.
  constraint zakazka_ukon_plan_unique unique (zakazka_id, plan_udrzby_id),
  constraint zakazka_ukon_poradi_unique unique (zakazka_id, poradi)
    deferrable initially deferred,
  -- Nevyřízený krok nemá kdy a kým být potvrzený, vyřízený má obojí.
  constraint zakazka_ukon_potvrzeni_sedi_se_stavem
    check ((stav = 'nesplneno') = (potvrzeno_at is null)),
  -- „Nelze provést" bez důvodu je pro toho, kdo to bude číst za rok, bezcenné.
  constraint zakazka_ukon_duvod_pri_neprovedeni
    check (stav <> 'nelze_provest' or length(btrim(coalesce(poznamka, ''))) > 0),
  -- Splněné měření musí mít naměřenou hodnotu, jinak se nemá čím doložit.
  constraint zakazka_ukon_mereni_ma_hodnotu
    check (not (stav = 'splneno' and vyzaduje_hodnotu and hodnota is null))
);

create index zakazka_ukon_zakazka_idx on public.zakazka_ukon (zakazka_id, poradi);
create index zakazka_ukon_plan_idx    on public.zakazka_ukon (plan_udrzby_id);

comment on table public.zakazka_ukon is
  'Krok checklistu. Text je zkopírovaný z matice, aby historie zůstala čitelná i po archivaci verze.';

comment on column public.zakazka_ukon.kontrolni_body is
  'Zadání bodů i odpovědi technika v jednom poli. Tvar hlídá jsou_platne_odpovedi_bodu.';

-- -----------------------------------------------------------------------------
-- Fotky ke kroku
--
-- Wireframe 5.3 věší fotky na krok, ne na zakázku - „📷 2" je u konkrétního
-- kroku a u jiného je foto rovnou povinné (vyzaduje_foto).
-- -----------------------------------------------------------------------------

create table public.zakazka_foto (
  id              uuid primary key default gen_random_uuid(),
  zakazka_ukon_id uuid not null references public.zakazka_ukon (id) on delete cascade,
  storage_path    text not null unique,
  popis           text,
  nahral_id       uuid references public.profil (id) on delete set null,
  vytvoreno_at    timestamptz not null default now(),
  constraint zakazka_foto_cesta_neni_prazdna check (length(btrim(storage_path)) > 0)
);

create index zakazka_foto_ukon_idx on public.zakazka_foto (zakazka_ukon_id);

comment on table public.zakazka_foto is
  'Fotodokumentace kroku (zadání ř. 129). Soubory leží v Supabase Storage, viz migrace 0012.';

-- -----------------------------------------------------------------------------
-- Neměnnost uzavřené zakázky (rozhodnutí R5)
--
-- „Historii nebude možné mazat" (zadání ř. 155) je jen půlka věci - historie,
-- kterou lze zpětně přepsat, je stejně bezcenná jako smazaná. Uzavřená zakázka
-- se proto nedá měnit ani mazat, a hlídá to databáze, ne konvence v aplikaci.
--
-- Uzavřená = dokončená nebo zrušená. Obojí je konec: co se má udělat znovu,
-- naplánuje plánovač jako novou zakázku.
-- -----------------------------------------------------------------------------

create or replace function public.zamkni_uzavrenou_zakazku()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Zakázky se nemažou - historie údržby musí zůstat úplná.'
      using errcode = '23514';
  end if;

  -- Otevřená zakázka se měnit smí, včetně uzavření.
  if old.stav in ('naplanovano', 'probiha') then
    return new;
  end if;

  raise exception 'Zakázka je uzavřená (%) a nelze ji měnit.', old.stav
    using errcode = '23514';
end;
$$;

comment on function public.zamkni_uzavrenou_zakazku is
  'Po dokončení nebo zrušení je zakázka neměnná. Historie, kterou lze přepsat, nemá důkazní hodnotu.';

create or replace function public.zamkni_ukony_uzavrene_zakazky()
returns trigger
language plpgsql
as $$
declare
  v_zakazka uuid;
  v_stav    public.stav_zakazky;
begin
  if tg_op = 'DELETE' then
    v_zakazka := old.zakazka_id;
  else
    v_zakazka := new.zakazka_id;
  end if;

  select stav into v_stav from public.zakazka where id = v_zakazka;

  -- v_stav is null znamená, že zakázka už neexistuje. Smazat ji nejde a zařízení
  -- pod ní drží `on delete restrict`, takže se sem dá dostat leda při úklidu
  -- schématu - a tam bránit nemá smysl.
  if v_stav is not null and v_stav not in ('naplanovano', 'probiha') then
    raise exception 'Zakázka je uzavřená (%), její checklist už nelze měnit.', v_stav
      using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  -- Zadání kroku se vyplňováním nemění. Text úkonu chrání sloupcová práva níž,
  -- ale kontrolní body nesou zadání i odpověď v jednom sloupci - tady se tedy
  -- musí ohlídat, že technik přepsal jen odpovědi, ne otázky.
  if tg_op = 'UPDATE'
     and public.zadani_kontrolnich_bodu(new.kontrolni_body)
         is distinct from public.zadani_kontrolnich_bodu(old.kontrolni_body)
  then
    raise exception 'Zadání kontrolních bodů je součástí matice a při vyplňování se nemění.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function public.zamkni_fotky_uzavrene_zakazky()
returns trigger
language plpgsql
as $$
declare
  v_ukon uuid;
  v_stav public.stav_zakazky;
begin
  if tg_op = 'DELETE' then
    v_ukon := old.zakazka_ukon_id;
  else
    v_ukon := new.zakazka_ukon_id;
  end if;

  select z.stav into v_stav
  from public.zakazka_ukon u
  join public.zakazka z on z.id = u.zakazka_id
  where u.id = v_ukon;

  if v_stav is not null and v_stav not in ('naplanovano', 'probiha') then
    raise exception 'Zakázka je uzavřená (%), fotodokumentaci už nelze měnit.', v_stav
      using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Triggery
-- -----------------------------------------------------------------------------

create trigger zakazka_zmeneno_at
  before update on public.zakazka
  for each row execute function public.nastav_zmeneno_at();

create trigger zakazka_zamek
  before update or delete on public.zakazka
  for each row execute function public.zamkni_uzavrenou_zakazku();

create trigger zakazka_ukon_zamek
  before insert or update or delete on public.zakazka_ukon
  for each row execute function public.zamkni_ukony_uzavrene_zakazky();

create trigger zakazka_foto_zamek
  before insert or update or delete on public.zakazka_foto
  for each row execute function public.zamkni_fotky_uzavrene_zakazky();

create trigger zakazka_audit
  after insert or update or delete on public.zakazka
  for each row execute function public.audit_zmeny();

create trigger zakazka_ukon_audit
  after insert or update or delete on public.zakazka_ukon
  for each row execute function public.audit_zmeny();

create trigger zakazka_foto_audit
  after insert or update or delete on public.zakazka_foto
  for each row execute function public.audit_zmeny();

-- -----------------------------------------------------------------------------
-- Kdo smí provádět údržbu
--
-- Řádek „Provedení údržby" v matici oprávnění (NAVRH.md kap. 3.1) je jediný,
-- kde má právo zápisu i údržbář - a jediný, kde ho nemá management. Proto
-- vlastní funkce, ne delegace na spravuje_zarizeni_v_oblasti: tam údržbář
-- jen čte.
--
-- Na profesi zakázky se schválně neptá. Zadání nikde neříká, že revizi elektro
-- smí odklikat jen elektrikář, a kdyby to databáze vynucovala, zaskočená směna
-- by systém obešla papírem. Profese říká, komu se zakázka nabízí, ne kdo je
-- jediný oprávněný.
-- -----------------------------------------------------------------------------

create or replace function public.provadi_udrzbu_v_oblasti(p_oblast uuid)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select public.muze_zapisovat() and public.ma_pristup_k_oblasti(p_oblast);
$$;

comment on function public.provadi_udrzbu_v_oblasti is
  'Smí přihlášený uživatel provádět údržbu v dané oblasti? Na rozdíl od šablon sem patří i údržbář.';

-- -----------------------------------------------------------------------------
-- Row Level Security
--
-- Čtení je širší než zápis schválně: management na provedení údržby nesmí
-- (matice oprávnění), ale historii zařízení číst má (ř. 147 zadání) a ta stojí
-- právě na dokončených zakázkách. Hranicí čtení je proto oblast, ne role.
-- -----------------------------------------------------------------------------

alter table public.zakazka      enable row level security;
alter table public.zakazka_ukon enable row level security;
alter table public.zakazka_foto enable row level security;

-- zakazka ---------------------------------------------------------------------
create policy zakazka_select on public.zakazka
  for select to authenticated
  using (
    exists (
      select 1 from public.zarizeni z
      where z.id = zakazka.zarizeni_id
        and public.ma_pristup_k_oblasti(z.oblast_id)
    )
  );

-- Jen UPDATE: zakládá plánovač, maže se nikdy.
create policy zakazka_update on public.zakazka
  for update to authenticated
  using (
    exists (
      select 1 from public.zarizeni z
      where z.id = zakazka.zarizeni_id
        and public.provadi_udrzbu_v_oblasti(z.oblast_id)
    )
  )
  with check (
    exists (
      select 1 from public.zarizeni z
      where z.id = zakazka.zarizeni_id
        and public.provadi_udrzbu_v_oblasti(z.oblast_id)
    )
  );

-- zakazka_ukon ----------------------------------------------------------------
-- Práva se dědí od zakázky, ke které krok patří.
create policy zakazka_ukon_select on public.zakazka_ukon
  for select to authenticated
  using (
    exists (
      select 1
      from public.zakazka k
      join public.zarizeni z on z.id = k.zarizeni_id
      where k.id = zakazka_ukon.zakazka_id
        and public.ma_pristup_k_oblasti(z.oblast_id)
    )
  );

create policy zakazka_ukon_update on public.zakazka_ukon
  for update to authenticated
  using (
    exists (
      select 1
      from public.zakazka k
      join public.zarizeni z on z.id = k.zarizeni_id
      where k.id = zakazka_ukon.zakazka_id
        and public.provadi_udrzbu_v_oblasti(z.oblast_id)
    )
  )
  with check (
    exists (
      select 1
      from public.zakazka k
      join public.zarizeni z on z.id = k.zarizeni_id
      where k.id = zakazka_ukon.zakazka_id
        and public.provadi_udrzbu_v_oblasti(z.oblast_id)
    )
  );

-- zakazka_foto ----------------------------------------------------------------
create policy zakazka_foto_select on public.zakazka_foto
  for select to authenticated
  using (
    exists (
      select 1
      from public.zakazka_ukon u
      join public.zakazka k on k.id = u.zakazka_id
      join public.zarizeni z on z.id = k.zarizeni_id
      where u.id = zakazka_foto.zakazka_ukon_id
        and public.ma_pristup_k_oblasti(z.oblast_id)
    )
  );

-- Fotku smí přidat i odebrat ten, kdo údržbu provádí - ale jen dokud je
-- zakázka otevřená. Po uzavření to zarazí trigger, ne politika: omylem
-- nahranou fotku musí jít během práce smazat.
create policy zakazka_foto_zapis on public.zakazka_foto
  for all to authenticated
  using (
    exists (
      select 1
      from public.zakazka_ukon u
      join public.zakazka k on k.id = u.zakazka_id
      join public.zarizeni z on z.id = k.zarizeni_id
      where u.id = zakazka_foto.zakazka_ukon_id
        and public.provadi_udrzbu_v_oblasti(z.oblast_id)
    )
  )
  with check (
    exists (
      select 1
      from public.zakazka_ukon u
      join public.zakazka k on k.id = u.zakazka_id
      join public.zarizeni z on z.id = k.zarizeni_id
      where u.id = zakazka_foto.zakazka_ukon_id
        and public.provadi_udrzbu_v_oblasti(z.oblast_id)
    )
  );

-- -----------------------------------------------------------------------------
-- Práva
--
-- Výčet je schválně úzký. Bez INSERT na zakázku a její kroky nemůže ani garant
-- založit údržbu mimo matici - právě to zadání posílá do provozního deníku.
-- Bez DELETE nejde historii umazat ani omylem; zásada R5 říká, že tohle drží
-- granty, ne konvence.
--
-- UPDATE je vypsaný po sloupcích. RLS rozhoduje o řádcích, ne o sloupcích:
-- bez tohohle by technik při odklikávání checklistu směl přepsat i text úkonu
-- nebo termín, podle kterého se počítá zpoždění. Zamrazený obsah zakázky (R3)
-- by tím ztratil smysl - stačilo by ho přepsat před dokončením.
--
-- Co tu chybí schválně: zarizeni_id, sablona_verze_id, profese_role_id,
-- planovany_termin a všechny sloupce _snapshot. Ty určuje plánovač.
-- -----------------------------------------------------------------------------

revoke all on public.zakazka, public.zakazka_ukon, public.zakazka_foto from anon;

grant select on public.zakazka to authenticated;
grant update (stav, prirazeno_uzivateli_id, zahajeno_at, dokonceno_at, dokoncil_id, poznamka)
  on public.zakazka to authenticated;

grant select on public.zakazka_ukon to authenticated;
grant update (stav, hodnota, poznamka, kontrolni_body, potvrzeno_at, potvrdil_id)
  on public.zakazka_ukon to authenticated;

-- Dvě věty, ne jedna: sloupcová a tabulková práva se v jednom GRANT míchat
-- nedají. Přepsat jde jen popis, cesta k souboru a kdo ho nahrál zůstávají.
grant select, insert, delete on public.zakazka_foto to authenticated;
grant update (popis) on public.zakazka_foto to authenticated;

grant execute on function public.provadi_udrzbu_v_oblasti(uuid) to authenticated;
grant execute on function public.jsou_platne_odpovedi_bodu(jsonb) to authenticated;
grant execute on function public.zadani_kontrolnich_bodu(jsonb) to authenticated;
