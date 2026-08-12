-- =============================================================================
-- M0 - napojení schématu na Supabase Auth
--
-- TOHLE JE JEDINÁ MIGRACE ZÁVISLÁ NA SUPABASE. Migrace 0001 je čistý PostgreSQL
-- a nasadí se i na holý server. Přechod na jiné přihlašování znamená nahradit
-- tento soubor, nikoli přepisovat politiky. Podrobně v docs/PORTABILITA.md.
--
-- Obsahuje dvě věci:
--   1. napojení funkce aktualni_uzivatel() na auth.uid()
--   2. automatické zakládání profilu při vzniku účtu
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Šev: kdo je přihlášený uživatel
--
-- V 0001 čte funkce proměnnou spojení `app.uzivatel_id`. Pod Supabase přichází
-- identita v JWT, proto ji přepíšeme na auth.uid(). Signatura se nemění, takže
-- všech deset politik z 0001 funguje beze změny.
-- -----------------------------------------------------------------------------

create or replace function public.aktualni_uzivatel()
returns uuid
language sql
stable
as $$
  select auth.uid();
$$;

comment on function public.aktualni_uzivatel is
  'Vrací id přihlášeného uživatele z JWT (Supabase Auth). Šev - viz docs/PORTABILITA.md.';

-- -----------------------------------------------------------------------------
-- 2. Profil vzniká automaticky s účtem
--
-- Aby nemohl existovat účet bez profilu. profil.id se rovná auth.users.id -
-- cizí klíč mezi nimi ale záměrně není, aby schéma nezáviselo na schématu auth.
-- -----------------------------------------------------------------------------

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

drop trigger if exists po_vzniku_uzivatele on auth.users;

create trigger po_vzniku_uzivatele
  after insert on auth.users
  for each row execute function public.zaloz_profil();
