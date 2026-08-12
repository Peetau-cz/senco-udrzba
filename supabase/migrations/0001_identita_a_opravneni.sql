-- =============================================================================
-- M0 - Identita a oprávnění
--
-- Odpovídá docs/NAVRH.md kap. 2.1 (organizace a lidé), 2.6 (audit) a 3.2 (RLS).
-- Zbytek datového modelu (zařízení, šablony, zakázky, deník) přijde s moduly,
-- které jej používají.
--
-- Zásada R1: RLS je bezpečnostní hranice, ne aplikační kód. Aplikace pracuje
-- výhradně uživatelským JWT, servisní klíč se v ní nepoužívá.
-- Zásada R5: neměnnost auditu se vynucuje odebráním práv, ne konvencí.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Výčtové typy
-- -----------------------------------------------------------------------------

create type public.vztah_k_oblasti as enum ('garant', 'spolupracujici');

-- -----------------------------------------------------------------------------
-- Číselníky a organizace
-- -----------------------------------------------------------------------------

-- Oblasti údržby jsou DATA, ne výčet v kódu (zásada R2 v návrhu).
-- Přidání šesté oblasti je záznam zde, nikoli nasazení nové verze aplikace.
create table public.oblast (
  id           uuid primary key default gen_random_uuid(),
  kod          text not null unique,
  nazev        text not null,
  poradi       integer not null default 0,
  aktivni      boolean not null default true,
  vytvoreno_at timestamptz not null default now(),
  zmeneno_at   timestamptz not null default now()
);

comment on table public.oblast is 'Oblasti údržby ze zadání ř. 20-36. Rozšiřitelné bez zásahu do kódu.';

create table public.role (
  id     uuid primary key default gen_random_uuid(),
  kod    text not null unique,
  nazev  text not null,
  popis  text,
  poradi integer not null default 0
);

comment on table public.role is 'Uživatelské role ze zadání ř. 42-49.';

create table public.umisteni (
  id           uuid primary key default gen_random_uuid(),
  kod          text not null unique,
  nazev        text not null,
  nadrazene_id uuid references public.umisteni (id) on delete restrict,
  vytvoreno_at timestamptz not null default now(),
  zmeneno_at   timestamptz not null default now(),
  constraint umisteni_neni_sam_sobe_nadrazen check (id <> nadrazene_id)
);

create index umisteni_nadrazene_idx on public.umisteni (nadrazene_id);

-- Rozšíření Supabase Auth. Řádek zakládá trigger nad auth.users (viz níže).
create table public.profil (
  id            uuid primary key references auth.users (id) on delete cascade,
  jmeno         text not null default '',
  prijmeni      text not null default '',
  osobni_cislo  text unique,
  email         text not null,
  aktivni       boolean not null default true,
  vytvoreno_at  timestamptz not null default now(),
  zmeneno_at    timestamptz not null default now()
);

create table public.uzivatel_role (
  uzivatel_id uuid not null references public.profil (id) on delete cascade,
  role_id     uuid not null references public.role (id) on delete restrict,
  primary key (uzivatel_id, role_id)
);

-- Lakovna má podle zadání (ř. 32-36) garanta i spolupracující osobu - proto sloupec vztah.
create table public.uzivatel_oblast (
  uzivatel_id uuid not null references public.profil (id) on delete cascade,
  oblast_id   uuid not null references public.oblast (id) on delete cascade,
  vztah       public.vztah_k_oblasti not null default 'spolupracujici',
  primary key (uzivatel_id, oblast_id)
);

create index uzivatel_oblast_oblast_idx on public.uzivatel_oblast (oblast_id);

-- -----------------------------------------------------------------------------
-- Auditní log - append only
-- -----------------------------------------------------------------------------

create table public.audit_log (
  id          bigint generated always as identity primary key,
  tabulka     text not null,
  zaznam_id   text not null,
  operace     text not null check (operace in ('INSERT', 'UPDATE', 'DELETE')),
  stary_stav  jsonb,
  novy_stav   jsonb,
  uzivatel_id uuid,
  cas         timestamptz not null default now()
);

create index audit_log_zaznam_idx on public.audit_log (tabulka, zaznam_id);
create index audit_log_cas_idx on public.audit_log (cas desc);

comment on table public.audit_log is
  'Neměnný auditní záznam (zadání ř. 157-162). Zapisuje výhradně trigger; práva UPDATE a DELETE jsou odebrána.';

-- -----------------------------------------------------------------------------
-- Pomocné funkce pro RLS
--
-- SECURITY DEFINER je zde nutnost, ne pohodlí: politika nad uzivatel_role, která
-- by uzivatel_role sama dotazovala, by skončila nekonečnou rekurzí.
-- Pevný search_path brání podstrčení objektů z jiného schématu.
-- -----------------------------------------------------------------------------

create or replace function public.ma_roli(p_kod text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.uzivatel_role ur
    join public.role r on r.id = ur.role_id
    where ur.uzivatel_id = auth.uid()
      and r.kod = p_kod
  );
$$;

comment on function public.ma_roli is 'Má přihlášený uživatel roli daného kódu?';

-- Vedoucí údržby, management a administrátor vidí všechny oblasti (zadání ř. 51).
-- Ostatní jen ty, které mají přiřazené (ř. 52).
create or replace function public.ma_pristup_k_oblasti(p_oblast uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    public.ma_roli('administrator')
    or public.ma_roli('vedouci_udrzby')
    or public.ma_roli('management')
    or exists (
      select 1
      from public.uzivatel_oblast uo
      where uo.uzivatel_id = auth.uid()
        and uo.oblast_id = p_oblast
    );
$$;

create or replace function public.je_garantem_oblasti(p_oblast uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.uzivatel_oblast uo
    where uo.uzivatel_id = auth.uid()
      and uo.oblast_id = p_oblast
      and uo.vztah = 'garant'
  );
$$;

-- Management je podle zadání (ř. 49) pouze pro čtení. Zápis smí ten, kdo drží
-- alespoň jednu jinou roli než management.
create or replace function public.muze_zapisovat()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.uzivatel_role ur
    join public.role r on r.id = ur.role_id
    where ur.uzivatel_id = auth.uid()
      and r.kod <> 'management'
  );
$$;

create or replace function public.spravuje_ciselniky()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.ma_roli('administrator') or public.ma_roli('vedouci_udrzby');
$$;

-- -----------------------------------------------------------------------------
-- Triggery
-- -----------------------------------------------------------------------------

create or replace function public.nastav_zmeneno_at()
returns trigger
language plpgsql
as $$
begin
  new.zmeneno_at := now();
  return new;
end;
$$;

-- Univerzální auditní trigger. SECURITY DEFINER proto, aby zápis do audit_log
-- prošel i tehdy, když volající nemá na audit_log právo INSERT - a on ho nemá.
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
    -- Vazební tabulky nemají sloupec id, klíčem je uzivatel_id.
    coalesce(v_zaznam ->> 'id', v_zaznam ->> 'uzivatel_id', ''),
    tg_op,
    v_stary,
    v_novy,
    auth.uid()
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- Profil vzniká automaticky s uživatelem, aby nemohl existovat účet bez profilu.
create or replace function public.zaloz_profil()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profil (id, email, jmeno, prijmeni, osobni_cislo)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'jmeno', ''),
    coalesce(new.raw_user_meta_data ->> 'prijmeni', ''),
    nullif(new.raw_user_meta_data ->> 'osobni_cislo', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger po_vzniku_uzivatele
  after insert on auth.users
  for each row execute function public.zaloz_profil();

create trigger oblast_zmeneno_at   before update on public.oblast   for each row execute function public.nastav_zmeneno_at();
create trigger umisteni_zmeneno_at before update on public.umisteni for each row execute function public.nastav_zmeneno_at();
create trigger profil_zmeneno_at   before update on public.profil   for each row execute function public.nastav_zmeneno_at();

create trigger oblast_audit          after insert or update or delete on public.oblast          for each row execute function public.audit_zmeny();
create trigger role_audit            after insert or update or delete on public.role            for each row execute function public.audit_zmeny();
create trigger umisteni_audit        after insert or update or delete on public.umisteni        for each row execute function public.audit_zmeny();
create trigger profil_audit          after insert or update or delete on public.profil          for each row execute function public.audit_zmeny();
create trigger uzivatel_role_audit   after insert or update or delete on public.uzivatel_role   for each row execute function public.audit_zmeny();
create trigger uzivatel_oblast_audit after insert or update or delete on public.uzivatel_oblast for each row execute function public.audit_zmeny();

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------

alter table public.oblast          enable row level security;
alter table public.role            enable row level security;
alter table public.umisteni        enable row level security;
alter table public.profil          enable row level security;
alter table public.uzivatel_role   enable row level security;
alter table public.uzivatel_oblast enable row level security;
alter table public.audit_log       enable row level security;

-- oblast ----------------------------------------------------------------------
create policy oblast_select on public.oblast
  for select to authenticated
  using (public.ma_pristup_k_oblasti(id));

create policy oblast_insert on public.oblast
  for insert to authenticated
  with check (public.spravuje_ciselniky());

create policy oblast_update on public.oblast
  for update to authenticated
  using (public.spravuje_ciselniky())
  with check (public.spravuje_ciselniky());

create policy oblast_delete on public.oblast
  for delete to authenticated
  using (public.ma_roli('administrator'));

-- role ------------------------------------------------------------------------
create policy role_select on public.role
  for select to authenticated
  using (true);

create policy role_zapis on public.role
  for all to authenticated
  using (public.ma_roli('administrator'))
  with check (public.ma_roli('administrator'));

-- umisteni --------------------------------------------------------------------
create policy umisteni_select on public.umisteni
  for select to authenticated
  using (true);

create policy umisteni_zapis on public.umisteni
  for all to authenticated
  using (public.spravuje_ciselniky())
  with check (public.spravuje_ciselniky());

-- profil ----------------------------------------------------------------------
-- Jména kolegů jsou v systému údržby provozní údaj (odpovědná osoba, kdo úkon
-- provedl), proto je smí číst každý přihlášený. Retenci řeší docs/PROVOZ.md kap. 2.
create policy profil_select on public.profil
  for select to authenticated
  using (true);

create policy profil_update_vlastni on public.profil
  for update to authenticated
  using (id = auth.uid() or public.ma_roli('administrator'))
  with check (id = auth.uid() or public.ma_roli('administrator'));

create policy profil_insert_admin on public.profil
  for insert to authenticated
  with check (public.ma_roli('administrator'));

-- uzivatel_role ---------------------------------------------------------------
create policy uzivatel_role_select on public.uzivatel_role
  for select to authenticated
  using (
    uzivatel_id = auth.uid()
    or public.ma_roli('administrator')
    or public.ma_roli('vedouci_udrzby')
    or public.ma_roli('management')
  );

create policy uzivatel_role_zapis on public.uzivatel_role
  for all to authenticated
  using (public.ma_roli('administrator'))
  with check (public.ma_roli('administrator'));

-- uzivatel_oblast -------------------------------------------------------------
create policy uzivatel_oblast_select on public.uzivatel_oblast
  for select to authenticated
  using (
    uzivatel_id = auth.uid()
    or public.ma_roli('administrator')
    or public.ma_roli('vedouci_udrzby')
    or public.ma_roli('management')
  );

create policy uzivatel_oblast_zapis on public.uzivatel_oblast
  for all to authenticated
  using (public.ma_roli('administrator'))
  with check (public.ma_roli('administrator'));

-- audit_log -------------------------------------------------------------------
-- Číst smí administrátor, vedoucí údržby a management (matice oprávnění kap. 3.1).
-- Zapisovat nesmí nikdo přímo - jen trigger.
create policy audit_log_select on public.audit_log
  for select to authenticated
  using (
    public.ma_roli('administrator')
    or public.ma_roli('vedouci_udrzby')
    or public.ma_roli('management')
  );

-- -----------------------------------------------------------------------------
-- Práva
--
-- RLS řídí, které řádky uživatel uvidí. Nemazatelnost auditu ale RLS nezajistí -
-- na to je potřeba odebrat právo na úrovni tabulky (zásada R5).
-- -----------------------------------------------------------------------------

revoke all on all tables in schema public from anon;

grant select on
  public.oblast, public.role, public.umisteni, public.profil,
  public.uzivatel_role, public.uzivatel_oblast, public.audit_log
  to authenticated;

grant insert, update, delete on
  public.oblast, public.role, public.umisteni,
  public.uzivatel_role, public.uzivatel_oblast
  to authenticated;

grant insert, update on public.profil to authenticated;

-- Klíčové pro neměnnost auditu.
revoke insert, update, delete on public.audit_log from authenticated, anon;

grant execute on function
  public.ma_roli(text),
  public.ma_pristup_k_oblasti(uuid),
  public.je_garantem_oblasti(uuid),
  public.muze_zapisovat(),
  public.spravuje_ciselniky()
  to authenticated;
