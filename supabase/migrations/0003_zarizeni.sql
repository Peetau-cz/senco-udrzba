-- =============================================================================
-- M1 - Evidence zařízení
--
-- Odpovídá docs/NAVRH.md kap. 2.2. Přidává tři tabulky: typ zařízení s definicí
-- vlastních technických parametrů, samotná zařízení a soubory ke kartě.
--
-- Stejně jako 0001 je tohle čistý PostgreSQL - žádná závislost na Supabase.
-- Politiky se ptají pouze funkcí z 0001, které stojí nad public.aktualni_uzivatel().
-- Viz docs/PORTABILITA.md.
--
-- Zásada R1: RLS je bezpečnostní hranice, ne aplikační kód.
-- Zásada R2: co je číselník, patří do dat, ne do výčtu v kódu.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Výčtové typy
-- -----------------------------------------------------------------------------

-- Vyřazený stroj z evidence nemizí - drží si historii údržby (M5). Proto stav,
-- nikoli mazání řádku.
create type public.stav_zarizeni as enum ('v_provozu', 'odstaveno', 'v_oprave', 'vyrazeno');

create type public.druh_souboru as enum ('foto', 'navod', 'certifikat');

-- -----------------------------------------------------------------------------
-- Kontrola tvaru schématu parametrů
--
-- schema_parametru popisuje, jaké vlastní technické údaje se u typu evidují
-- (zadání ř. 93). Tvar:
--   {"vreteno_otacky": {"typ":"cislo","popisek":"Otáčky vřetene",
--                       "jednotka":"1/min","povinne":true}}
-- Funkce je IMMUTABLE a nesahá do jiných tabulek, takže smí být v CHECK.
-- -----------------------------------------------------------------------------

create or replace function public.je_platne_schema_parametru(p_schema jsonb)
returns boolean
language sql
immutable
as $$
  select p_schema is null or (
    jsonb_typeof(p_schema) = 'object'
    and not exists (
      select 1
      from jsonb_each(p_schema) as pole(klic, definice)
      where jsonb_typeof(pole.definice) <> 'object'
         or pole.definice ->> 'typ' is null
         or pole.definice ->> 'typ' not in ('text', 'cislo', 'ano_ne', 'vyber')
         -- Výběr bez seznamu možností by byl nevyplnitelný.
         or (
           pole.definice ->> 'typ' = 'vyber'
           and (
             jsonb_typeof(pole.definice -> 'moznosti') is distinct from 'array'
             or jsonb_array_length(pole.definice -> 'moznosti') = 0
           )
         )
    )
  );
$$;

comment on function public.je_platne_schema_parametru is
  'Ověří tvar definice vlastních parametrů typu zařízení. Zrcadlí src/lib/zarizeni/parametry.ts.';

-- -----------------------------------------------------------------------------
-- Typy zařízení
-- -----------------------------------------------------------------------------

create table public.typ_zarizeni (
  id               uuid primary key default gen_random_uuid(),
  oblast_id        uuid not null references public.oblast (id) on delete restrict,
  kod              text not null unique,
  nazev            text not null,
  popis            text,
  schema_parametru jsonb not null default '{}'::jsonb,
  aktivni          boolean not null default true,
  vytvoreno_at     timestamptz not null default now(),
  zmeneno_at       timestamptz not null default now(),
  constraint typ_zarizeni_nazev_neni_prazdny check (length(btrim(nazev)) > 0),
  constraint typ_zarizeni_schema_ma_platny_tvar
    check (public.je_platne_schema_parametru(schema_parametru)),
  -- Cíl není jedinečnost (id už je klíč), ale opora pro složený cizí klíč ze
  -- zarizeni, který drží zařízení a jeho typ ve stejné oblasti.
  constraint typ_zarizeni_id_oblast_unique unique (id, oblast_id)
);

create index typ_zarizeni_oblast_idx on public.typ_zarizeni (oblast_id);

comment on table public.typ_zarizeni is
  'Typy zařízení v rámci oblasti. schema_parametru definuje vlastní technické parametry (zadání ř. 93).';

-- -----------------------------------------------------------------------------
-- Zařízení
--
-- Hybrid pevných sloupců a JSONB je záměr (kap. 2.2): čistý EAV by znemožnil
-- rozumně psát dotazy nad plněním matice v M4.
-- -----------------------------------------------------------------------------

create table public.zarizeni (
  id                 uuid primary key default gen_random_uuid(),
  oblast_id          uuid not null references public.oblast (id) on delete restrict,
  typ_zarizeni_id    uuid not null,
  nazev              text not null,
  -- Nepovinné: stroj se do evidence dostane dřív, než pro něj vznikne štítek.
  -- Jakmile ale číslo je, musí být jedinečné v celém podniku.
  inventarni_cislo   text unique,
  vyrobce            text,
  model              text,
  vyrobni_cislo      text,
  rok_vyroby         smallint,
  umisteni_id        uuid references public.umisteni (id) on delete restrict,
  odpovedna_osoba_id uuid references public.profil (id) on delete set null,
  stav               public.stav_zarizeni not null default 'v_provozu',
  parametry          jsonb not null default '{}'::jsonb,
  poznamka           text,
  vytvoreno_at       timestamptz not null default now(),
  zmeneno_at         timestamptz not null default now(),
  constraint zarizeni_nazev_neni_prazdny check (length(btrim(nazev)) > 0),
  constraint zarizeni_inventarni_cislo_neni_prazdne
    check (inventarni_cislo is null or length(btrim(inventarni_cislo)) > 0),
  constraint zarizeni_rok_vyroby_v_rozsahu
    check (rok_vyroby is null or rok_vyroby between 1900 and 2200),
  constraint zarizeni_parametry_jsou_objekt check (jsonb_typeof(parametry) = 'object'),
  -- Zařízení nemůže mít typ z cizí oblasti. Vynucuje to složený cizí klíč, ne
  -- trigger - databáze to ohlídá i při hromadném importu.
  constraint zarizeni_typ_ze_stejne_oblasti
    foreign key (typ_zarizeni_id, oblast_id)
    references public.typ_zarizeni (id, oblast_id) on delete restrict
);

create index zarizeni_oblast_idx     on public.zarizeni (oblast_id);
create index zarizeni_typ_idx        on public.zarizeni (typ_zarizeni_id);
create index zarizeni_umisteni_idx   on public.zarizeni (umisteni_id);
create index zarizeni_odpovedny_idx  on public.zarizeni (odpovedna_osoba_id);
create index zarizeni_stav_idx       on public.zarizeni (stav);

comment on table public.zarizeni is
  'Karta zařízení (zadání ř. 88-96). Vyřazené zařízení zůstává kvůli historii, mění se jen stav.';

-- -----------------------------------------------------------------------------
-- Soubory ke kartě zařízení
--
-- Tabulka vzniká už teď, ať je datový model M1 úplný. Vlastní nahrávání souborů
-- a politiky úložiště přijdou samostatnou migrací, protože úložiště je - na
-- rozdíl od tohoto souboru - vázané na Supabase.
-- -----------------------------------------------------------------------------

create table public.zarizeni_soubor (
  id           uuid primary key default gen_random_uuid(),
  zarizeni_id  uuid not null references public.zarizeni (id) on delete cascade,
  druh         public.druh_souboru not null,
  nazev        text not null,
  cesta        text not null unique,
  mime         text,
  velikost_b   bigint,
  nahral_id    uuid references public.profil (id) on delete set null,
  vytvoreno_at timestamptz not null default now(),
  constraint zarizeni_soubor_velikost_nezaporna check (velikost_b is null or velikost_b >= 0)
);

create index zarizeni_soubor_zarizeni_idx on public.zarizeni_soubor (zarizeni_id, druh);

-- -----------------------------------------------------------------------------
-- Validace parametrů proti schématu typu
--
-- Návrh (kap. 2.2) mluví o CHECK. Ten ale nesmí sáhnout do jiné tabulky, a
-- schéma leží u typu zařízení - proto trigger. Kontrola je tím pádem stejně
-- neobejitelná, jen se ohlásí při zápisu.
--
-- Stejná pravidla platí v src/lib/zarizeni/parametry.ts, aby uživatel dostal
-- hlášku ve formuláři dřív než z databáze. Autoritou zůstává tenhle trigger.
-- -----------------------------------------------------------------------------

create or replace function public.zkontroluj_parametry_zarizeni()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_schema   jsonb;
  v_klic     text;
  v_hodnota  jsonb;
  v_definice jsonb;
  v_typ      text;
  v_popisek  text;
begin
  select schema_parametru into v_schema
  from public.typ_zarizeni
  where id = new.typ_zarizeni_id;

  v_schema := coalesce(v_schema, '{}'::jsonb);

  -- 1. Nic navíc: parametr, který schéma nezná, je překlep nebo pozůstatek po
  --    změně typu. Tiše uložený by se v kartě nikdy neukázal.
  for v_klic, v_hodnota in select * from jsonb_each(new.parametry) loop
    v_definice := v_schema -> v_klic;

    if v_definice is null then
      raise exception 'Parametr "%" není v schématu typu zařízení.', v_klic
        using errcode = '23514';
    end if;

    -- Prázdná hodnota se řeší až u povinnosti níž.
    continue when jsonb_typeof(v_hodnota) = 'null';

    v_typ := v_definice ->> 'typ';
    v_popisek := coalesce(v_definice ->> 'popisek', v_klic);

    if v_typ = 'cislo' and jsonb_typeof(v_hodnota) <> 'number' then
      raise exception 'Parametr "%" musí být číslo.', v_popisek using errcode = '23514';
    elsif v_typ = 'text' and jsonb_typeof(v_hodnota) <> 'string' then
      raise exception 'Parametr "%" musí být text.', v_popisek using errcode = '23514';
    elsif v_typ = 'ano_ne' and jsonb_typeof(v_hodnota) <> 'boolean' then
      raise exception 'Parametr "%" musí být ano/ne.', v_popisek using errcode = '23514';
    elsif v_typ = 'vyber' and (
      jsonb_typeof(v_hodnota) <> 'string'
      or not jsonb_exists(v_definice -> 'moznosti', v_hodnota #>> '{}')
    ) then
      raise exception 'Parametr "%" má hodnotu mimo povolený seznam.', v_popisek
        using errcode = '23514';
    end if;
  end loop;

  -- 2. Nic nechybí.
  for v_klic, v_definice in select * from jsonb_each(v_schema) loop
    if coalesce((v_definice ->> 'povinne')::boolean, false) then
      v_hodnota := new.parametry -> v_klic;
      if v_hodnota is null
         or jsonb_typeof(v_hodnota) = 'null'
         or (jsonb_typeof(v_hodnota) = 'string' and btrim(v_hodnota #>> '{}') = '')
      then
        raise exception 'Parametr "%" je povinný.', coalesce(v_definice ->> 'popisek', v_klic)
          using errcode = '23514';
      end if;
    end if;
  end loop;

  return new;
end;
$$;

comment on function public.zkontroluj_parametry_zarizeni is
  'Ověří parametry zařízení proti schema_parametru jeho typu. Náhrada za CHECK, který přes tabulky nedosáhne.';

-- -----------------------------------------------------------------------------
-- Kdo smí spravovat evidenci
--
-- Matice oprávnění (kap. 3.1) dává zápis do zařízení garantům oblastí. Garantství
-- je vazba v uzivatel_oblast, ale samo o sobě nestačí: údržbář je podle seedu
-- garantem strojní oblasti, a přesto karty strojů zakládat nemá - provádí údržbu.
-- Proto se ptáme na obojí, roli i vazbu.
--
-- Seznam rolí zrcadlí konstantu GARANTI v src/lib/auth/opravneni.ts. Nová role
-- s právem na evidenci znamená zásah na obou místech.
-- -----------------------------------------------------------------------------

create or replace function public.spravuje_zarizeni_v_oblasti(p_oblast uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    public.muze_zapisovat()
    and (
      -- Administrátor a vedoucí údržby napříč oblastmi (zadání ř. 51).
      public.spravuje_ciselniky()
      or (
        public.je_garantem_oblasti(p_oblast)
        and (
          public.ma_roli('specialista_cnc')
          or public.ma_roli('specialista_elektro')
          or public.ma_roli('vedouci_lakovny')
          or public.ma_roli('pracovnik_skladu')
        )
      )
    );
$$;

comment on function public.spravuje_zarizeni_v_oblasti is
  'Smí přihlášený uživatel měnit evidenci zařízení v dané oblasti? Role i garantství zároveň.';

-- -----------------------------------------------------------------------------
-- Triggery
-- -----------------------------------------------------------------------------

create trigger typ_zarizeni_zmeneno_at before update on public.typ_zarizeni for each row execute function public.nastav_zmeneno_at();
create trigger zarizeni_zmeneno_at     before update on public.zarizeni     for each row execute function public.nastav_zmeneno_at();

create trigger zarizeni_kontrola_parametru
  before insert or update of parametry, typ_zarizeni_id on public.zarizeni
  for each row execute function public.zkontroluj_parametry_zarizeni();

create trigger typ_zarizeni_audit    after insert or update or delete on public.typ_zarizeni    for each row execute function public.audit_zmeny();
create trigger zarizeni_audit        after insert or update or delete on public.zarizeni        for each row execute function public.audit_zmeny();
create trigger zarizeni_soubor_audit after insert or update or delete on public.zarizeni_soubor for each row execute function public.audit_zmeny();

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------

alter table public.typ_zarizeni    enable row level security;
alter table public.zarizeni        enable row level security;
alter table public.zarizeni_soubor enable row level security;

-- typ_zarizeni ----------------------------------------------------------------
create policy typ_zarizeni_select on public.typ_zarizeni
  for select to authenticated
  using (public.ma_pristup_k_oblasti(oblast_id));

create policy typ_zarizeni_insert on public.typ_zarizeni
  for insert to authenticated
  with check (public.spravuje_zarizeni_v_oblasti(oblast_id));

create policy typ_zarizeni_update on public.typ_zarizeni
  for update to authenticated
  using (public.spravuje_zarizeni_v_oblasti(oblast_id))
  with check (public.spravuje_zarizeni_v_oblasti(oblast_id));

create policy typ_zarizeni_delete on public.typ_zarizeni
  for delete to authenticated
  using (public.spravuje_ciselniky());

-- zarizeni --------------------------------------------------------------------
create policy zarizeni_select on public.zarizeni
  for select to authenticated
  using (public.ma_pristup_k_oblasti(oblast_id));

create policy zarizeni_insert on public.zarizeni
  for insert to authenticated
  with check (public.spravuje_zarizeni_v_oblasti(oblast_id));

-- Obě klauzule schválně: `using` brání sáhnout na cizí zařízení, `with check`
-- brání přesunout vlastní zařízení do oblasti, kam uživatel nesmí.
create policy zarizeni_update on public.zarizeni
  for update to authenticated
  using (public.spravuje_zarizeni_v_oblasti(oblast_id))
  with check (public.spravuje_zarizeni_v_oblasti(oblast_id));

-- Mazání je výjimka pro správce, ne běžný postup. Vyřazený stroj se označuje
-- stavem 'vyrazeno', jinak by s ním zmizela historie údržby.
create policy zarizeni_delete on public.zarizeni
  for delete to authenticated
  using (public.spravuje_ciselniky());

-- zarizeni_soubor -------------------------------------------------------------
-- Práva se dědí od zařízení, ke kterému soubor patří.
create policy zarizeni_soubor_select on public.zarizeni_soubor
  for select to authenticated
  using (
    exists (
      select 1 from public.zarizeni z
      where z.id = zarizeni_soubor.zarizeni_id
        and public.ma_pristup_k_oblasti(z.oblast_id)
    )
  );

create policy zarizeni_soubor_zapis on public.zarizeni_soubor
  for all to authenticated
  using (
    exists (
      select 1 from public.zarizeni z
      where z.id = zarizeni_soubor.zarizeni_id
        and public.spravuje_zarizeni_v_oblasti(z.oblast_id)
    )
  )
  with check (
    exists (
      select 1 from public.zarizeni z
      where z.id = zarizeni_soubor.zarizeni_id
        and public.spravuje_zarizeni_v_oblasti(z.oblast_id)
    )
  );

-- -----------------------------------------------------------------------------
-- Práva
-- -----------------------------------------------------------------------------

revoke all on public.typ_zarizeni, public.zarizeni, public.zarizeni_soubor from anon;

grant select, insert, update, delete on
  public.typ_zarizeni, public.zarizeni, public.zarizeni_soubor
  to authenticated;

grant execute on function
  public.je_platne_schema_parametru(jsonb),
  public.spravuje_zarizeni_v_oblasti(uuid)
  to authenticated;
