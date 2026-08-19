-- =============================================================================
-- M3 - Plán údržby
--
-- Odpovídá docs/NAVRH.md kap. 2.4, tabulka plan_udrzby: živý stav plánovače,
-- jeden řádek na kombinaci zařízení × úkon. Z něj bude v migraci 0012 zakládat
-- zakázky noční úloha.
--
-- Návrh počítal s vazbou plan_udrzby.sablona_ukon_id. Ta ale nemůže fungovat,
-- a je to vidět až teď, když se plán staví nad hotovým verzováním z M2:
-- zaloz_navrh_verze() matici KOPÍRUJE, takže každý úkon dostane v nové verzi
-- nové id. Po vydání verze 2 by plán ukazoval na řádky verze 1 - buď by se
-- plánovalo podle archivované matice, nebo by se všechno naplánovalo znovu od
-- začátku a garant by termíny zadával pokaždé odznova.
--
-- Chybí tedy odpověď na otázku, kterou verzování samo o sobě neřeší: co dělá
-- „týdenní kontrolu vřetena" ve verzi 3 TÍMŽ úkonem jako ve verzi 1. Ani název
-- (garant přejmenovává), ani pořadí (garant přeskládává). Úkon proto dostává
-- stálý klíč, který kopie do dalšího návrhu přenese - a plán se váže na něj.
--
-- Rozhodnutí uživatele z 19. 8. 2026: první termín NEPLYNE z data přiřazení
-- ani ze společného data pro celý stroj. Zadá ho garant u každého úkonu zvlášť.
-- Proto je dalsi_termin nullable: řádek plánu vznikne přiřazením sám, ale dokud
-- v něm termín není, plánovač ho přeskočí a garant ho vidí v seznamu k doplnění.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Stálá identita úkonu napříč verzemi
--
-- Volatilní default (gen_random_uuid) se u ADD COLUMN vyhodnocuje pro každý
-- řádek zvlášť, takže stávající úkony dostanou navzájem různé klíče. To je tady
-- správně: každý existující úkon je svou vlastní linií, žádné dvě se neslévají.
-- -----------------------------------------------------------------------------

alter table public.sablona_ukon
  add column klic uuid not null default gen_random_uuid();

comment on column public.sablona_ukon.klic is
  'Stálá identita úkonu napříč verzemi šablony. Kopie do nového návrhu ji přenáší, plán se váže na ni.';

-- V rámci jedné verze je klíč jedinečný. Dva řádky téže linie ve stejné matici
-- by znamenaly dva plány pro jeden úkon.
create unique index sablona_ukon_klic_unique
  on public.sablona_ukon (sablona_verze_id, klic);

-- -----------------------------------------------------------------------------
-- Oprava kopie matice
--
-- Dvě věci naráz:
--   1. klic se musí přenést, jinak celá tahle migrace nemá smysl,
--   2. nabizi_poznamku se nepřenášelo vůbec. Sloupec přibyl v migraci 0008,
--      ale výčet sloupců v téhle funkci s ním nikdo nedoplnil. Důsledek: garant
--      otevře novou verzi a všem úkonům tiše zmizí pole na rozepsání. Chyba
--      z M2, projeví se až při druhé verzi šablony - proto ji nikdo nezachytil.
--
-- Poučení do dalších sloupců matice: kdo přidá sloupec do sablona_ukon, musí
-- ho doplnit i sem.
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
      sablona_verze_id, klic, poradi, nazev, popis, interval_typ, interval_hodnota,
      interval_zaklad, tolerance_dny, profese_role_id, kontrolni_body,
      vyzaduje_foto, vyzaduje_hodnotu, nabizi_poznamku, jednotka, mez_min, mez_max
    )
    select
      v_navrh, klic, poradi, nazev, popis, interval_typ, interval_hodnota,
      interval_zaklad, tolerance_dny, profese_role_id, kontrolni_body,
      vyzaduje_foto, vyzaduje_hodnotu, nabizi_poznamku, jednotka, mez_min, mez_max
    from public.sablona_ukon
    where sablona_verze_id = v_zdroj;
  end if;

  return v_navrh;
end;
$$;

comment on function public.zaloz_navrh_verze is
  'Založí návrh nové verze a zkopíruje do něj matici z právě platné verze včetně stálých klíčů úkonů. Existující návrh vrátí beze změny.';

-- -----------------------------------------------------------------------------
-- Plán údržby
--
-- Řádek = „tenhle stroj má tenhle úkon dělat příště tehdy". Vzniká sám
-- přiřazením šablony stroji a aktivací verze (triggery níž), termín do něj
-- doplňuje garant.
--
-- Vazba jde na dvojici (zarizeni_id, sablona_id), tedy na PŘIŘAZENÍ, ne zvlášť
-- na stroj a zvlášť na šablonu. Díky tomu nemůže existovat plán pro stroj,
-- který už tu šablonu nemá - hlídá to cizí klíč, ne aplikace.
--
-- Odebrání šablony stroji plán smaže. Zvažovalo se místo toho jen deaktivovat
-- a při novém přiřazení oživit, ale to by znamenalo držet řádky pro stroje,
-- kterých se šablona netýká, a plánovač by u každého musel ověřovat, že
-- přiřazení pořád platí - druhá pravda vedle cizího klíče. Historie tím
-- netrpí: hotové zakázky mají vlastní kopii úkonů a plán přežijí (0011).
-- -----------------------------------------------------------------------------

create table public.plan_udrzby (
  id                    uuid primary key default gen_random_uuid(),
  zarizeni_id           uuid not null,
  sablona_id            uuid not null,
  -- Klíč úkonu, ne jeho id: id se s každou verzí mění, klíč ne.
  ukon_klic             uuid not null,
  -- Null = garant termín ještě nezadal. Plánovač takový řádek přeskakuje.
  dalsi_termin          date,
  posledni_provedeno_at timestamptz,
  -- False u úkonu, který garant z matice v nové verzi vyřadil. Řádek se nemaže,
  -- protože drží posledni_provedeno_at a odkazují se na něj zakázky.
  aktivni               boolean not null default true,
  vytvoreno_at          timestamptz not null default now(),
  zmeneno_at            timestamptz not null default now(),
  constraint plan_udrzby_ukon_unique unique (zarizeni_id, sablona_id, ukon_klic),
  constraint plan_udrzby_prirazeni_fk
    foreign key (zarizeni_id, sablona_id)
    references public.zarizeni_sablona (zarizeni_id, sablona_id)
    on update cascade on delete cascade
);

-- Hlavní dotaz plánovače: co je splatné. Částečný index, protože řádky bez
-- termínu a neaktivní ho nezajímají.
create index plan_udrzby_termin_idx
  on public.plan_udrzby (dalsi_termin)
  where aktivni and dalsi_termin is not null;

create index plan_udrzby_zarizeni_idx on public.plan_udrzby (zarizeni_id);
create index plan_udrzby_sablona_idx  on public.plan_udrzby (sablona_id);

comment on table public.plan_udrzby is
  'Živý stav plánovače: kdy se má který úkon na kterém stroji dělat příště (NAVRH.md kap. 2.4).';

comment on column public.plan_udrzby.dalsi_termin is
  'Datum příští údržby. Null = čeká na garanta, plánovač řádek přeskočí.';

-- -----------------------------------------------------------------------------
-- Srovnání plánu s maticí
--
-- Jedna funkce pro obě situace, kdy se plán může rozejít s maticí:
--   - garant přiřadí šablonu stroji  → chybí řádky pro všechny úkony,
--   - aktivuje se nová verze         → přibyly nebo zmizely linie úkonů.
--
-- Je idempotentní: co sedí, nechá být. Termíny nikdy nepřepisuje - to, co garant
-- zadal, je jeho rozhodnutí a nová verze šablony ho nemá právo posunout.
--
-- SECURITY DEFINER schválně: volá se z triggerů nad přiřazením a verzemi, kde
-- právo na zápis do plánu už bylo ověřené tím, že uživatel směl provést tu
-- původní změnu. Bez toho by garant nemohl přiřadit šablonu, protože by
-- neprošel INSERT do plánu spuštěný jeho vlastní akcí.
-- -----------------------------------------------------------------------------

create or replace function public.srovnej_plan(p_zarizeni uuid, p_sablona uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_verze uuid;
begin
  select id into v_verze
  from public.sablona_verze
  where sablona_id = p_sablona and stav = 'aktivni';

  -- Šablona bez platné verze nemá matici, podle které by se dalo plánovat.
  -- Řádky plánu tím ale nemizí: verze se vydává průběžně a mezitím se nic
  -- neplánuje jen proto, že chvíli žádná neplatí.
  if v_verze is null then
    return;
  end if;

  -- Nové linie úkonů. Termín se nedoplňuje, garant ho zadá sám.
  insert into public.plan_udrzby (zarizeni_id, sablona_id, ukon_klic)
  select p_zarizeni, p_sablona, u.klic
  from public.sablona_ukon u
  where u.sablona_verze_id = v_verze
  on conflict (zarizeni_id, sablona_id, ukon_klic) do nothing;

  -- Úkon, který v nové verzi není, se přestane plánovat. Vrácení úkonu zpátky
  -- do matice řádek zase oživí i s tím, kdy se naposled dělal.
  update public.plan_udrzby p
  set aktivni = exists (
        select 1 from public.sablona_ukon u
        where u.sablona_verze_id = v_verze and u.klic = p.ukon_klic
      ),
      zmeneno_at = now()
  where p.zarizeni_id = p_zarizeni
    and p.sablona_id = p_sablona
    and p.aktivni <> exists (
        select 1 from public.sablona_ukon u
        where u.sablona_verze_id = v_verze and u.klic = p.ukon_klic
      );
end;
$$;

comment on function public.srovnej_plan is
  'Doplní plán o nové úkony matice a vyřadí ty, které z ní zmizely. Zadané termíny nechává být.';

-- -----------------------------------------------------------------------------
-- Triggery, které plán drží srovnaný
-- -----------------------------------------------------------------------------

create or replace function public.plan_po_prirazeni()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.srovnej_plan(new.zarizeni_id, new.sablona_id);
  return new;
end;
$$;

create trigger zarizeni_sablona_plan
  after insert on public.zarizeni_sablona
  for each row execute function public.plan_po_prirazeni();

-- Aktivace verze se týká všech strojů, které šablonu mají - přesně proto se
-- změna matice „automaticky projeví u všech" (zadání ř. 108).
create or replace function public.plan_po_aktivaci_verze()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_zarizeni uuid;
begin
  if new.stav <> 'aktivni' or old.stav = 'aktivni' then
    return new;
  end if;

  for v_zarizeni in
    select zarizeni_id from public.zarizeni_sablona where sablona_id = new.sablona_id
  loop
    perform public.srovnej_plan(v_zarizeni, new.sablona_id);
  end loop;

  return new;
end;
$$;

-- AFTER, ne BEFORE: srovnej_plan si čte aktivní verzi z tabulky, takže nový
-- stav už tam musí být zapsaný.
create trigger sablona_verze_plan
  after update of stav on public.sablona_verze
  for each row execute function public.plan_po_aktivaci_verze();

create trigger plan_udrzby_zmeneno_at
  before update on public.plan_udrzby
  for each row execute function public.nastav_zmeneno_at();

create trigger plan_udrzby_audit
  after insert or update or delete on public.plan_udrzby
  for each row execute function public.audit_zmeny();

-- -----------------------------------------------------------------------------
-- Row Level Security
--
-- Řádek „Plán údržby" v matici oprávnění (NAVRH.md kap. 3.1) má stejná práva
-- jako „Šablony a matice": garant zapisuje ve své oblasti, údržbář čte,
-- management čte. Oblast se čte ze zařízení - plán ji nenese, protože ji už
-- drží zarizeni_sablona, na které visí cizím klíčem.
-- -----------------------------------------------------------------------------

alter table public.plan_udrzby enable row level security;

create policy plan_udrzby_select on public.plan_udrzby
  for select to authenticated
  using (
    exists (
      select 1 from public.zarizeni z
      where z.id = plan_udrzby.zarizeni_id
        and public.ma_pristup_k_oblasti(z.oblast_id)
    )
  );

-- Zakládání a rušení řádků obstarávají triggery (SECURITY DEFINER), takže
-- politika řeší hlavně UPDATE - tedy zadání a posun termínu.
create policy plan_udrzby_zapis on public.plan_udrzby
  for all to authenticated
  using (
    exists (
      select 1 from public.zarizeni z
      where z.id = plan_udrzby.zarizeni_id
        and public.spravuje_sablony_v_oblasti(z.oblast_id)
    )
  )
  with check (
    exists (
      select 1 from public.zarizeni z
      where z.id = plan_udrzby.zarizeni_id
        and public.spravuje_sablony_v_oblasti(z.oblast_id)
    )
  );

-- -----------------------------------------------------------------------------
-- Práva
-- -----------------------------------------------------------------------------

revoke all on public.plan_udrzby from anon;

-- Bez DELETE: řádky plánu ruší kaskáda od přiřazení, ne uživatel. Vyřazený
-- úkon se drží se sloupcem aktivni = false, protože nese poslední provedení.
grant select, insert, update on public.plan_udrzby to authenticated;

grant execute on function public.srovnej_plan(uuid, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Srovnání plánu pro data, která už v databázi jsou
--
-- Šablona CNC je přiřazená pěti strojům ze seedu, ale trigger tehdy neexistoval.
-- Bez tohohle kroku by pět strojů × 16 úkonů zůstalo bez plánu do chvíle, než
-- garant vydá další verzi.
-- -----------------------------------------------------------------------------

do $$
declare
  v_radek record;
begin
  for v_radek in select zarizeni_id, sablona_id from public.zarizeni_sablona loop
    perform public.srovnej_plan(v_radek.zarizeni_id, v_radek.sablona_id);
  end loop;
end;
$$;
