-- =============================================================================
-- M6 - napojení účtu na osobu (Supabase Auth)
--
-- Druhá migrace závislá na Supabase, hned po 0002. Migrace 0024 je čistý
-- PostgreSQL a nasadí se i na holý server. Viz docs/PORTABILITA.md.
--
-- Obsahuje dvě věci:
--   1. šev aktualni_uzivatel() nově překládá ÚČET na OSOBU
--   2. vznik účtu se napojí na existující osobu, místo aby zakládal druhou
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Šev: z účtu na osobu
--
-- Doteď vracela funkce rovnou auth.uid(), protože profil.id se účtu rovnalo.
-- Nově je účet jen jedna z vlastností osoby, takže se musí přeložit. Signatura
-- se nemění, takže všechny politiky z 0001 i všechno, co na nich stojí,
-- funguje beze změny - přesně kvůli tomuhle ten šev existuje.
--
-- SECURITY DEFINER je tu nově nutnost: funkce sahá na profil a volá se ze
-- všech politik. Bez něj by se čtení profilu proplétalo s RLS nad profilem.
-- Čte se přes profil_ucet_idx, takže je to index scan na jeden řádek.
--
-- Kdo nemá osobu, dostane NULL a neprojde žádnou politikou. To je správně:
-- účet bez osoby je porucha, ne stav, ve kterém se má pracovat.
-- -----------------------------------------------------------------------------

create or replace function public.aktualni_uzivatel()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id from public.profil p where p.ucet_id = auth.uid();
$$;

comment on function public.aktualni_uzivatel is
  'Vrací id OSOBY podle přihlášeného účtu (Supabase Auth). Šev - viz docs/PORTABILITA.md.';

-- -----------------------------------------------------------------------------
-- 2. Vznik účtu osobu napojí, nezaloží druhou
--
-- Garant bývá v systému jako osoba dřív, než dostane přihlášení - někdo ho
-- zapsal do oblasti a on odklikával úkony u kiosku. Kdyby trigger založil
-- nový profil, měl by ten člověk v systému dvě identity a jeho historie by
-- se rozpadla na dvě poloviny.
--
-- Spojujeme přes mail, protože právě mail je to, čím účet vzniká. Osobu
-- bereme jen tehdy, když ještě žádný účet nemá.
--
-- Nová osoba dostane VLASTNÍ id, ne id účtu. Je to schválně: kdyby se občas
-- rovnaly a občas ne, svádělo by to k témuž předpokladu, který tahle dvojice
-- migrací vyvrací. Takhle se chyba pozná hned.
-- -----------------------------------------------------------------------------

create or replace function public.zaloz_profil()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email  text := nullif(btrim(coalesce(new.email, '')), '');
  v_osoba  uuid;
begin
  if v_email is not null then
    select p.id into v_osoba
    from public.profil p
    where p.ucet_id is null
      and lower(p.email) = lower(v_email)
    limit 1;
  end if;

  if v_osoba is not null then
    update public.profil
    set ucet_id      = new.id,
        -- Údaje z účtu doplníme jen tam, kde osoba nic neměla.
        jmeno        = case when btrim(jmeno) = ''    then coalesce(new.raw_user_meta_data ->> 'jmeno', '')    else jmeno end,
        prijmeni     = case when btrim(prijmeni) = '' then coalesce(new.raw_user_meta_data ->> 'prijmeni', '') else prijmeni end,
        osobni_cislo = coalesce(osobni_cislo, nullif(new.raw_user_meta_data ->> 'osobni_cislo', ''))
    where id = v_osoba;

    return new;
  end if;

  insert into public.profil (email, ucet_id, jmeno, prijmeni, osobni_cislo)
  values (
    v_email,
    new.id,
    coalesce(new.raw_user_meta_data ->> 'jmeno', ''),
    coalesce(new.raw_user_meta_data ->> 'prijmeni', ''),
    nullif(new.raw_user_meta_data ->> 'osobni_cislo', '')
  );

  return new;
end;
$$;
