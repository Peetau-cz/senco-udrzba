-- =============================================================================
-- M2 - Šablony údržby, verzování a matice úkonů
--
-- Odpovídá docs/NAVRH.md kap. 2.3. Jádro celého systému: z těchto tabulek čte
-- plánovač (M3), checklist technika (M3) i výpočet plnění matice (M4).
--
-- Zadání klade tři požadavky, které si na první pohled odporují (ř. 96-111):
--   1. jedna šablona přiřazená více zařízením stejného typu,
--   2. změna šablony se automaticky projeví u všech těch zařízení,
--   3. šablony musí podporovat verzování.
--
-- Rozpor mezi 2 a 3 řeší rozhodnutí R3: zařízení ukazuje na ŠABLONU (proto se
-- změna projeví sama), kdežto hotová zakázka bude ukazovat na konkrétní VERZI.
-- Aby to mělo cenu, musí být aktivovaná verze neměnná - jinak by úprava šablony
-- zpětně přepsala, co technik odškrtal, a historie by ztratila důkazní hodnotu.
-- Neměnnost proto drží trigger v databázi, ne konvence v kódu. Stejný přístup
-- jako u audit_log v migraci 0001.
--
-- Zadání zároveň zakazuje zjednodušení (ř. 121-124): matice se mezi zařízeními
-- můžou významně lišit, aplikace nesmí předpokládat jednotnou strukturu. Proto
-- je úkon řádek v tabulce, ne položka výčtu v kódu (zásada R2).
--
-- Čistý PostgreSQL, bez závislosti na Supabase. Politiky se ptají jen funkcí
-- z 0001 a 0003, které stojí nad public.aktualni_uzivatel(). Viz PORTABILITA.md.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Výčtové typy
-- -----------------------------------------------------------------------------

-- Životní cyklus verze. Archivovaná verze se nemaže - drží ji hotové zakázky.
create type public.stav_verze as enum ('navrh', 'aktivni', 'archivovana');

-- Rozhodnutí P1: pouze kalendářní intervaly. Motohodiny ani cykly zadání
-- nepožaduje a stroje je dnes nehlásí.
create type public.interval_typ as enum ('dny', 'tydny', 'mesice', 'roky');

-- Rozhodnutí P2: od čeho se počítá další termín. Nastavuje se na úkonu, protože
-- se to mezi úkony liší - revize se plánuje od plánu, mazání od provedení.
create type public.interval_zaklad as enum ('od_provedeni', 'od_planu');

-- -----------------------------------------------------------------------------
-- Opora pro složený cizí klíč ze zarizeni_sablona
--
-- Cíl není jedinečnost (id už je klíč), ale možnost odkazovat na dvojici
-- (id, oblast_id) a držet tak zařízení i šablonu ve stejné oblasti. Stejný trik
-- jako u typ_zarizeni v migraci 0003.
-- -----------------------------------------------------------------------------

alter table public.zarizeni
  add constraint zarizeni_id_oblast_unique unique (id, oblast_id);

-- -----------------------------------------------------------------------------
-- Šablona
--
-- Sloupec aktivni_verze_id z návrhu kap. 2.3 tu schválně NENÍ. Byla by to druhá
-- pravda vedle sablona_verze.stav, kterou by musel udržovat trigger - a zásada
-- R1 říká, že dvě místa se dřív nebo později rozejdou. Že je aktivní nejvýš
-- jedna verze, hlídá částečný unikátní index níž; databáze to tedy zaručuje
-- silněji, než by dokázal dopočítávaný ukazatel.
-- -----------------------------------------------------------------------------

create table public.sablona (
  id           uuid primary key default gen_random_uuid(),
  oblast_id    uuid not null references public.oblast (id) on delete restrict,
  kod          text not null unique,
  nazev        text not null,
  popis        text,
  aktivni      boolean not null default true,
  vytvoreno_at timestamptz not null default now(),
  zmeneno_at   timestamptz not null default now(),
  constraint sablona_kod_neni_prazdny check (length(btrim(kod)) > 0),
  constraint sablona_nazev_neni_prazdny check (length(btrim(nazev)) > 0),
  constraint sablona_id_oblast_unique unique (id, oblast_id)
);

create index sablona_oblast_idx on public.sablona (oblast_id);

comment on table public.sablona is
  'Šablona údržby (zadání ř. 96-111). Přiřazuje se více zařízením stejného typu, obsah drží verze.';

-- -----------------------------------------------------------------------------
-- Verze šablony
--
-- Po aktivaci je řádek i celá jeho matice neměnná - hlídají to triggery níž.
-- Editace šablony proto neznamená UPDATE, ale založení nového návrhu
-- (zaloz_navrh_verze) a jeho aktivaci (aktivuj_verzi).
-- -----------------------------------------------------------------------------

create table public.sablona_verze (
  id                uuid primary key default gen_random_uuid(),
  sablona_id        uuid not null references public.sablona (id) on delete cascade,
  cislo_verze       integer not null,
  stav              public.stav_verze not null default 'navrh',
  -- Vyplní se až aktivací; návrh žádnou platnost nemá.
  platna_od         timestamptz,
  vytvoril_id       uuid references public.profil (id) on delete set null,
  poznamka_ke_zmene text,
  vytvoreno_at      timestamptz not null default now(),
  constraint sablona_verze_cislo_kladne check (cislo_verze > 0),
  constraint sablona_verze_cislo_unique unique (sablona_id, cislo_verze),
  constraint sablona_verze_platnost_jen_po_aktivaci
    check ((stav = 'navrh') = (platna_od is null)),
  -- Opora pro složený cizí klíč ze sablona_ukon, který drží úkon a verzi
  -- v téže šabloně.
  constraint sablona_verze_id_sablona_unique unique (id, sablona_id)
);

create index sablona_verze_sablona_idx on public.sablona_verze (sablona_id, cislo_verze desc);

-- Rozestavěný návrh smí být jen jeden; jinak by nebylo poznat, který se aktivuje.
create unique index sablona_verze_jediny_navrh
  on public.sablona_verze (sablona_id) where stav = 'navrh';

-- Klíčová záruka: v jeden okamžik platí nejvýš jedna verze šablony.
create unique index sablona_verze_jedina_aktivni
  on public.sablona_verze (sablona_id) where stav = 'aktivni';

comment on table public.sablona_verze is
  'Verze obsahu šablony. Po aktivaci neměnná (R3) - hotová zakázka se na ni bude odkazovat.';

-- -----------------------------------------------------------------------------
-- Úkon = jeden řádek matice údržby
--
-- Sloupce odpovídají sablona_ukony.csv z docs/PRIPRAVA_DAT.md, podle kterého
-- garanti data připravují. Co je tam popsané jako povinné, je tu NOT NULL.
-- -----------------------------------------------------------------------------

create table public.sablona_ukon (
  id               uuid primary key default gen_random_uuid(),
  sablona_verze_id uuid not null references public.sablona_verze (id) on delete cascade,
  poradi           integer not null,
  nazev            text not null,
  popis            text,
  interval_typ     public.interval_typ not null,
  interval_hodnota integer not null,
  interval_zaklad  public.interval_zaklad not null default 'od_provedeni',
  -- Kolik dní po termínu se úkon ještě počítá jako splněný. Bez tolerance by
  -- KPI plnění v M4 trestala i údržbu udělanou o den později.
  tolerance_dny    integer not null default 0,
  -- Profese, ne konkrétní člověk: matice platí pro N strojů a lidi se mění.
  profese_role_id  uuid not null references public.role (id) on delete restrict,
  kontrolni_body   jsonb not null default '[]'::jsonb,
  vyzaduje_foto    boolean not null default false,
  vyzaduje_hodnotu boolean not null default false,
  jednotka         text,
  mez_min          numeric,
  mez_max          numeric,
  vytvoreno_at     timestamptz not null default now(),
  constraint sablona_ukon_nazev_neni_prazdny check (length(btrim(nazev)) > 0),
  constraint sablona_ukon_interval_kladny check (interval_hodnota > 0),
  constraint sablona_ukon_tolerance_nezaporna check (tolerance_dny >= 0),
  constraint sablona_ukon_kontrolni_body_jsou_pole
    check (jsonb_typeof(kontrolni_body) = 'array'),
  -- „Meze bez jednotky nelze zobrazit ani vyhodnotit" - časté chyby
  -- v PRIPRAVA_DAT.md. Stejně tak jednotka u úkonu, kde se nic neměří.
  constraint sablona_ukon_mereni_ma_jednotku
    check (not vyzaduje_hodnotu or jednotka is not null),
  constraint sablona_ukon_meze_jen_pri_mereni
    check (vyzaduje_hodnotu or (jednotka is null and mez_min is null and mez_max is null)),
  constraint sablona_ukon_meze_ve_spravnem_poradi
    check (mez_min is null or mez_max is null or mez_min <= mez_max),
  -- Pořadí je krok v checklistu, dvakrát stejné nedává smysl. Odložené na konec
  -- transakce, aby šlo úkony v návrhu přeskládat jedním UPDATE.
  constraint sablona_ukon_poradi_unique unique (sablona_verze_id, poradi)
    deferrable initially deferred
);

create index sablona_ukon_verze_idx   on public.sablona_ukon (sablona_verze_id, poradi);
create index sablona_ukon_profese_idx on public.sablona_ukon (profese_role_id);

comment on table public.sablona_ukon is
  'Matice údržby (zadání ř. 112-118). Jeden řádek = jeden úkon v jedné verzi šablony.';

-- -----------------------------------------------------------------------------
-- Přiřazení šablony zařízením
--
-- Zařízení ukazuje na šablonu, ne na verzi - právě proto se změna šablony
-- projeví u všech přiřazených strojů, jak zadání žádá (ř. 108).
--
-- Sloupec oblast_id je vědomá denormalizace: umožňuje složené cizí klíče, které
-- ohlídají, že zařízení i šablona patří do téže oblasti. Trigger by to zvládl
-- taky, ale cizí klíč to udrží i při hromadném importu (P6).
-- -----------------------------------------------------------------------------

create table public.zarizeni_sablona (
  zarizeni_id   uuid not null,
  sablona_id    uuid not null,
  oblast_id     uuid not null,
  prirazeno_od  date not null default current_date,
  prirazil_id   uuid references public.profil (id) on delete set null,
  vytvoreno_at  timestamptz not null default now(),
  primary key (zarizeni_id, sablona_id),
  constraint zarizeni_sablona_zarizeni_fk
    foreign key (zarizeni_id, oblast_id) references public.zarizeni (id, oblast_id)
    on update cascade on delete cascade,
  constraint zarizeni_sablona_sablona_fk
    foreign key (sablona_id, oblast_id) references public.sablona (id, oblast_id)
    on update cascade on delete restrict
);

create index zarizeni_sablona_sablona_idx on public.zarizeni_sablona (sablona_id);

comment on table public.zarizeni_sablona is
  'Která šablona platí pro které zařízení. Jedna šablona → N zařízení stejného typu.';

-- -----------------------------------------------------------------------------
-- Neměnnost aktivované verze (rozhodnutí R3)
-- -----------------------------------------------------------------------------

create or replace function public.zamkni_aktivovanou_verzi()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    -- Aktivovaná verze se nemaže ani po archivaci: odkazují se na ni hotové
    -- zakázky a s ní by zmizel doklad o tom, co se kdy dělalo.
    if old.stav <> 'navrh' then
      raise exception 'Verzi %, která už byla aktivovaná, nelze smazat.', old.cislo_verze
        using errcode = '23514';
    end if;
    return old;
  end if;

  -- Návrh je rozestavěný obsah, ten se měnit smí - včetně aktivace.
  if old.stav = 'navrh' then
    return new;
  end if;

  -- Jediná povolená změna aktivované verze je její archivace při nástupu nové.
  if old.stav = 'aktivni'
     and new.stav = 'archivovana'
     and new.sablona_id = old.sablona_id
     and new.cislo_verze = old.cislo_verze
     and new.platna_od is not distinct from old.platna_od
     and new.poznamka_ke_zmene is not distinct from old.poznamka_ke_zmene
  then
    return new;
  end if;

  raise exception 'Aktivovaná verze % je neměnná. Založte nový návrh.', old.cislo_verze
    using errcode = '23514';
end;
$$;

comment on function public.zamkni_aktivovanou_verzi is
  'Po aktivaci je verze neměnná (R3). Povolený je jen přechod aktivni → archivovana.';

create or replace function public.zamkni_ukony_aktivovane_verze()
returns trigger
language plpgsql
as $$
declare
  v_verze uuid;
  v_stav  public.stav_verze;
begin
  if tg_op = 'DELETE' then
    v_verze := old.sablona_verze_id;
  else
    v_verze := new.sablona_verze_id;
  end if;

  select stav into v_stav from public.sablona_verze where id = v_verze;

  -- v_stav is null znamená, že verze už neexistuje: maže se celý návrh a tohle
  -- je jeho kaskáda. Bránit tady by znemožnilo rozdělaný návrh zahodit.
  if v_stav is not null and v_stav <> 'navrh' then
    raise exception 'Matici lze měnit jen v návrhu verze. Založte nový návrh šablony.'
      using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

comment on function public.zamkni_ukony_aktivovane_verze is
  'Matice se mění jen v návrhu. Po aktivaci by úprava zpětně přepsala, co technik odškrtal.';

-- -----------------------------------------------------------------------------
-- Práce s verzemi
--
-- Obojí je jedna transakce a víc kroků, proto to sedí v databázi, ne v aplikaci:
-- supabase-js neumí transakci a půlka provedené aktivace by nechala šablonu bez
-- platné verze.
--
-- Funkce jsou SECURITY INVOKER (výchozí), takže RLS platí dál - kdo nesmí
-- zapisovat do šablon své oblasti, neprojde ani přes ně.
-- -----------------------------------------------------------------------------

create or replace function public.zaloz_navrh_verze(p_sablona_id uuid)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_navrh   uuid;
  v_zdroj   uuid;
  v_cislo   integer;
begin
  -- Rozestavěný návrh už může existovat; druhý by stejně neprošel indexem.
  select id into v_navrh
  from public.sablona_verze
  where sablona_id = p_sablona_id and stav = 'navrh';

  if v_navrh is not null then
    return v_navrh;
  end if;

  select coalesce(max(cislo_verze), 0) + 1 into v_cislo
  from public.sablona_verze
  where sablona_id = p_sablona_id;

  insert into public.sablona_verze (sablona_id, cislo_verze, vytvoril_id)
  values (p_sablona_id, v_cislo, public.aktualni_uzivatel())
  returning id into v_navrh;

  -- Nový návrh vychází z toho, co právě platí - garant obvykle mění jeden řádek,
  -- ne celou matici. Úplně první verze začíná prázdná.
  select id into v_zdroj
  from public.sablona_verze
  where sablona_id = p_sablona_id and stav = 'aktivni';

  if v_zdroj is not null then
    insert into public.sablona_ukon (
      sablona_verze_id, poradi, nazev, popis, interval_typ, interval_hodnota,
      interval_zaklad, tolerance_dny, profese_role_id, kontrolni_body,
      vyzaduje_foto, vyzaduje_hodnotu, jednotka, mez_min, mez_max
    )
    select
      v_navrh, poradi, nazev, popis, interval_typ, interval_hodnota,
      interval_zaklad, tolerance_dny, profese_role_id, kontrolni_body,
      vyzaduje_foto, vyzaduje_hodnotu, jednotka, mez_min, mez_max
    from public.sablona_ukon
    where sablona_verze_id = v_zdroj;
  end if;

  return v_navrh;
end;
$$;

comment on function public.zaloz_navrh_verze is
  'Založí návrh nové verze a zkopíruje do něj matici z právě platné verze. Existující návrh vrátí beze změny.';

create or replace function public.aktivuj_verzi(p_verze_id uuid)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_sablona uuid;
  v_stav    public.stav_verze;
  v_ukonu   integer;
begin
  select sablona_id, stav into v_sablona, v_stav
  from public.sablona_verze
  where id = p_verze_id;

  if v_sablona is null then
    raise exception 'Verze šablony neexistuje.' using errcode = '23503';
  end if;

  if v_stav <> 'navrh' then
    raise exception 'Aktivovat lze jen návrh; tahle verze je %.', v_stav
      using errcode = '23514';
  end if;

  -- Prázdná matice se nedá naplánovat a v M4 by se počítala jako splněná
  -- na sto procent, protože není co plnit.
  select count(*) into v_ukonu from public.sablona_ukon where sablona_verze_id = p_verze_id;

  if v_ukonu = 0 then
    raise exception 'Verze bez jediného úkonu nemá co plánovat. Doplňte matici.'
      using errcode = '23514';
  end if;

  update public.sablona_verze
  set stav = 'archivovana'
  where sablona_id = v_sablona and stav = 'aktivni';

  update public.sablona_verze
  set stav = 'aktivni', platna_od = now()
  where id = p_verze_id;
end;
$$;

comment on function public.aktivuj_verzi is
  'Aktivuje návrh a archivuje dosavadní platnou verzi. Jedna transakce, ať šablona nezůstane bez verze.';

-- -----------------------------------------------------------------------------
-- Kdo smí spravovat šablony
--
-- Matice oprávnění (NAVRH.md kap. 3.1) dává řádku „Šablony a matice" stejná
-- práva jako řádku „Zařízení": administrátor a vedoucí údržby napříč, garant
-- ve své oblasti, údržbář jen čtení. Proto se to sem jen deleguje - kdyby se
-- pravidla někdy rozešla, změní se tělo téhle funkce a nic víc.
-- -----------------------------------------------------------------------------

create or replace function public.spravuje_sablony_v_oblasti(p_oblast uuid)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select public.spravuje_zarizeni_v_oblasti(p_oblast);
$$;

comment on function public.spravuje_sablony_v_oblasti is
  'Smí přihlášený uživatel měnit šablony v dané oblasti? Dnes shodné s právy na evidenci.';

-- -----------------------------------------------------------------------------
-- Doplnění auditu o novou vazební tabulku
--
-- audit_zmeny() z migrace 0001 hledá klíč záznamu jako `id`, pak `uzivatel_id`.
-- zarizeni_sablona nemá ani jedno - klíčem je dvojice zarizeni_id + sablona_id.
-- Bez tohohle doplnění by její auditní řádky měly prázdné zaznam_id a nešly
-- dohledat indexem audit_log_zaznam_idx. Tělo funkce je jinak beze změny.
-- -----------------------------------------------------------------------------

create or replace function public.audit_zmeny()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_stary  jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_novy   jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_zaznam jsonb := coalesce(v_novy, v_stary);
begin
  insert into public.audit_log (tabulka, zaznam_id, operace, stary_stav, novy_stav, uzivatel_id)
  values (
    tg_table_name,
    -- Vazební tabulky nemají sloupec id; klíčem je uzivatel_id, u přiřazení
    -- šablon zarizeni_id.
    coalesce(
      v_zaznam ->> 'id',
      v_zaznam ->> 'uzivatel_id',
      v_zaznam ->> 'zarizeni_id',
      ''
    ),
    tg_op,
    v_stary,
    v_novy,
    public.aktualni_uzivatel()
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Triggery
-- -----------------------------------------------------------------------------

create trigger sablona_zmeneno_at before update on public.sablona
  for each row execute function public.nastav_zmeneno_at();

create trigger sablona_verze_zamek before update or delete on public.sablona_verze
  for each row execute function public.zamkni_aktivovanou_verzi();

create trigger sablona_ukon_zamek before insert or update or delete on public.sablona_ukon
  for each row execute function public.zamkni_ukony_aktivovane_verze();

create trigger sablona_audit          after insert or update or delete on public.sablona          for each row execute function public.audit_zmeny();
create trigger sablona_verze_audit    after insert or update or delete on public.sablona_verze    for each row execute function public.audit_zmeny();
create trigger sablona_ukon_audit     after insert or update or delete on public.sablona_ukon     for each row execute function public.audit_zmeny();
create trigger zarizeni_sablona_audit after insert or update or delete on public.zarizeni_sablona for each row execute function public.audit_zmeny();

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------

alter table public.sablona          enable row level security;
alter table public.sablona_verze    enable row level security;
alter table public.sablona_ukon     enable row level security;
alter table public.zarizeni_sablona enable row level security;

-- sablona ---------------------------------------------------------------------
create policy sablona_select on public.sablona
  for select to authenticated
  using (public.ma_pristup_k_oblasti(oblast_id));

create policy sablona_insert on public.sablona
  for insert to authenticated
  with check (public.spravuje_sablony_v_oblasti(oblast_id));

-- Obě klauzule schválně: `using` brání sáhnout na cizí šablonu, `with check`
-- brání přesunout vlastní šablonu do oblasti, kam uživatel nesmí.
create policy sablona_update on public.sablona
  for update to authenticated
  using (public.spravuje_sablony_v_oblasti(oblast_id))
  with check (public.spravuje_sablony_v_oblasti(oblast_id));

-- Smazat jde jen šablona, která nikdy neplatila: jakmile má aktivovanou verzi,
-- zarazí to zámek na sablona_verze. Použitá šablona se vyřazuje z nabídky
-- sloupcem `aktivni`, stejně jako se vyřazený stroj neruší, ale mění stav.
create policy sablona_delete on public.sablona
  for delete to authenticated
  using (public.spravuje_ciselniky());

-- sablona_verze ---------------------------------------------------------------
-- Práva se dědí od šablony, ke které verze patří.
create policy sablona_verze_select on public.sablona_verze
  for select to authenticated
  using (
    exists (
      select 1 from public.sablona s
      where s.id = sablona_verze.sablona_id
        and public.ma_pristup_k_oblasti(s.oblast_id)
    )
  );

create policy sablona_verze_zapis on public.sablona_verze
  for all to authenticated
  using (
    exists (
      select 1 from public.sablona s
      where s.id = sablona_verze.sablona_id
        and public.spravuje_sablony_v_oblasti(s.oblast_id)
    )
  )
  with check (
    exists (
      select 1 from public.sablona s
      where s.id = sablona_verze.sablona_id
        and public.spravuje_sablony_v_oblasti(s.oblast_id)
    )
  );

-- sablona_ukon ----------------------------------------------------------------
create policy sablona_ukon_select on public.sablona_ukon
  for select to authenticated
  using (
    exists (
      select 1
      from public.sablona_verze v
      join public.sablona s on s.id = v.sablona_id
      where v.id = sablona_ukon.sablona_verze_id
        and public.ma_pristup_k_oblasti(s.oblast_id)
    )
  );

create policy sablona_ukon_zapis on public.sablona_ukon
  for all to authenticated
  using (
    exists (
      select 1
      from public.sablona_verze v
      join public.sablona s on s.id = v.sablona_id
      where v.id = sablona_ukon.sablona_verze_id
        and public.spravuje_sablony_v_oblasti(s.oblast_id)
    )
  )
  with check (
    exists (
      select 1
      from public.sablona_verze v
      join public.sablona s on s.id = v.sablona_id
      where v.id = sablona_ukon.sablona_verze_id
        and public.spravuje_sablony_v_oblasti(s.oblast_id)
    )
  );

-- zarizeni_sablona ------------------------------------------------------------
-- Oblast je přímo v řádku, takže se na nic dotazovat nemusíme.
create policy zarizeni_sablona_select on public.zarizeni_sablona
  for select to authenticated
  using (public.ma_pristup_k_oblasti(oblast_id));

create policy zarizeni_sablona_zapis on public.zarizeni_sablona
  for all to authenticated
  using (public.spravuje_sablony_v_oblasti(oblast_id))
  with check (public.spravuje_sablony_v_oblasti(oblast_id));

-- -----------------------------------------------------------------------------
-- Práva
-- -----------------------------------------------------------------------------

revoke all on
  public.sablona, public.sablona_verze, public.sablona_ukon, public.zarizeni_sablona
  from anon;

grant select, insert, update, delete on
  public.sablona, public.sablona_verze, public.sablona_ukon, public.zarizeni_sablona
  to authenticated;

grant execute on function
  public.spravuje_sablony_v_oblasti(uuid),
  public.zaloz_navrh_verze(uuid),
  public.aktivuj_verzi(uuid)
  to authenticated;
