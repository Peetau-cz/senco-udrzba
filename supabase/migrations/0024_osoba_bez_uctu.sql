-- =============================================================================
-- M6 - Osoba přestává potřebovat účet
--
-- Do teď platilo, že `profil` vzniká výhradně s účtem (trigger v migraci 0002),
-- takže kdo se nepřihlašuje, v systému neexistuje. To se opíralo o předpoklad,
-- který neplatí: mail má jen garant oddělení, jeho podřízení žádný nemají.
-- Zato mají kartu na turniket a osobní číslo.
--
-- Přitom na `profil` míří všechno, co nese odpovědnost - dokoncil_id,
-- provedl_id, odpovedna_osoba_id, audit_log.uzivatel_id. Bez téhle migrace by
-- v těch sloupcích skončilo jméno oddělení místo jména člověka.
--
-- Po téhle migraci znamená `profil` OSOBU a účet je jen jedna z jejích
-- vlastností. Kdo má ucet_id, přihlašuje se; kdo ne, existuje a pracuje, ale
-- nepřihlásí se nikdy.
--
-- Tenhle soubor je čistý PostgreSQL. Napojení na Supabase Auth je v 0025 -
-- stejné dělení jako u dvojice 0001 a 0002, viz docs/PORTABILITA.md.
--
-- Zásada R5: `revoke ... from anon, authenticated`, nikdy jen od anon
-- (poučení z migrace 0021).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Profil = osoba
-- -----------------------------------------------------------------------------

-- Bez defaultu by osobu bez účtu nešlo založit: id dodával systém přihlašování.
alter table public.profil alter column id set default gen_random_uuid();

-- Osoba bez mailu je legitimní. Prázdné řetězce z původního triggeru srovnáme
-- na NULL, ať „nemá mail" vypadá v datech jen jedním způsobem.
alter table public.profil alter column email drop not null;
update public.profil set email = null where btrim(coalesce(email, '')) = '';

alter table public.profil add column ucet_id uuid;

comment on column public.profil.ucet_id is
  'Identita v systému přihlašování (pod Supabase auth.users.id). NULL = osoba, která se nepřihlašuje.';

comment on table public.profil is
  'Lidé, kteří v systému vystupují. Účet má jen ten, kdo se přihlašuje - zbytek jsou osoby bez přihlášení.';

-- Stávající data sedí jedna ku jedné: doteď se profil.id rovnalo auth.users.id.
update public.profil set ucet_id = id where ucet_id is null;

create unique index profil_ucet_idx  on public.profil (ucet_id)      where ucet_id is not null;
create unique index profil_email_idx on public.profil (lower(email)) where email   is not null;

-- -----------------------------------------------------------------------------
-- 2. Karty
--
-- Samostatná tabulka, ne sloupec v profilu. Důvod je poučení z migrace 0021:
-- tabulkový GRANT SELECT přebije sloupcové granty, takže sloupec v profilu by
-- byl čitelný pro každého přihlášeného. Číslo karty je osobní údaj a čte ho
-- jen správa - kiosek se k němu dostane výhradně přes funkci níž.
--
-- Karta se nemaže, jen zneaktivní: ztracená karta má zůstat dohledatelná.
-- Unikátnost proto platí jen mezi aktivními - vyřazené číslo smí firma vydat znovu.
-- -----------------------------------------------------------------------------

create table public.karta (
  id           uuid primary key default gen_random_uuid(),
  profil_id    uuid not null references public.profil (id) on delete cascade,
  cislo        text not null,
  aktivni      boolean not null default true,
  poznamka     text,
  vytvoreno_at timestamptz not null default now(),
  zmeneno_at   timestamptz not null default now(),
  constraint karta_cislo_neni_prazdne check (length(btrim(cislo)) > 0)
);

create unique index karta_cislo_idx  on public.karta (cislo) where aktivni;
create index        karta_profil_idx on public.karta (profil_id);

comment on table public.karta is
  'Karty na turniket použité k identifikaci u kiosku. Číslo čteme vlastní čtečkou, s docházkou se neintegrujeme.';

create trigger karta_zmeneno_at before update on public.karta
  for each row execute function public.nastav_zmeneno_at();

create trigger karta_audit after insert or update or delete on public.karta
  for each row execute function public.audit_zmeny();

-- -----------------------------------------------------------------------------
-- 3. Kdo přiložil kartu
--
-- Kiosek se tabulky karta nedotkne - zeptá se funkcí a dostane jen jméno.
-- SECURITY DEFINER kvůli tomu, aby na tabulku nemusel mít právo.
--
-- Osobu vrátíme jen tehdy, když volající vidí aspoň jednu z jejích oblastí.
-- Kiosek strojní údržby tak nezjistí, kdo pracuje v lakovně.
-- -----------------------------------------------------------------------------

create or replace function public.osoba_podle_karty(p_cislo text)
returns table (id uuid, jmeno text, prijmeni text, osobni_cislo text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id, p.jmeno, p.prijmeni, p.osobni_cislo
  from public.karta k
  join public.profil p on p.id = k.profil_id
  where k.aktivni
    and p.aktivni
    and btrim(k.cislo) = btrim(p_cislo)
    and exists (
      select 1
      from public.uzivatel_oblast uo
      where uo.uzivatel_id = p.id
        and public.ma_pristup_k_oblasti(uo.oblast_id)
    );
$$;

comment on function public.osoba_podle_karty is
  'Kdo přiložil kartu. Vrací jen osobu z oblasti, na kterou volající vidí.';

-- Záloha pro toho, kdo si kartu nechal v bundě. Riziko je stejné jako
-- u půjčené karty a je vědomé - rozhodnutí z 28. 8. 2026.
create or replace function public.osoba_podle_osobniho_cisla(p_cislo text)
returns table (id uuid, jmeno text, prijmeni text, osobni_cislo text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id, p.jmeno, p.prijmeni, p.osobni_cislo
  from public.profil p
  where p.aktivni
    and p.osobni_cislo is not null
    and btrim(p.osobni_cislo) = btrim(p_cislo)
    and exists (
      select 1
      from public.uzivatel_oblast uo
      where uo.uzivatel_id = p.id
        and public.ma_pristup_k_oblasti(uo.oblast_id)
    );
$$;

comment on function public.osoba_podle_osobniho_cisla is
  'Záloha ke kartě: identifikace osobním číslem. Stejné omezení na oblasti jako u karty.';

-- -----------------------------------------------------------------------------
-- 4. Role kiosku
--
-- Kiosek je účet zařízení, ne člověka. Role mu dává právo zapisovat
-- (muze_zapisovat vyžaduje aspoň jednu roli mimo management) a zároveň
-- se podle ní pozná v politikách, co smět nemá. Rozsah řeší migrace 0026.
-- -----------------------------------------------------------------------------

insert into public.role (kod, nazev, popis, poradi) values
  ('kiosek', 'Kiosek', 'Účet dotykového zařízení v dílně. Odklikává zakázky a zapisuje do deníku ve své oblasti.', 9)
on conflict (kod) do update
  set nazev = excluded.nazev, popis = excluded.popis, poradi = excluded.poradi;

-- -----------------------------------------------------------------------------
-- 5. Row Level Security a práva
-- -----------------------------------------------------------------------------

alter table public.karta enable row level security;

-- Číslo karty je osobní údaj. Vidí ho jen ten, kdo karty spravuje.
create policy karta_select on public.karta
  for select to authenticated
  using (public.ma_roli('administrator') or public.ma_roli('vedouci_udrzby'));

create policy karta_zapis on public.karta
  for all to authenticated
  using (public.ma_roli('administrator') or public.ma_roli('vedouci_udrzby'))
  with check (public.ma_roli('administrator') or public.ma_roli('vedouci_udrzby'));

revoke all on public.karta from anon, authenticated;

-- Bez DELETE: vyřazená karta se zneaktivní, nemaže se.
grant select, insert on public.karta to authenticated;
grant update (cislo, aktivni, poznamka) on public.karta to authenticated;

grant execute on function
  public.osoba_podle_karty(text),
  public.osoba_podle_osobniho_cisla(text)
  to authenticated;
