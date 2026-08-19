-- =============================================================================
-- M3 - Plánovač
--
-- Odpovídá docs/NAVRH.md kap. 1.3. Tři funkce:
--   dalsi_termin      - jediné místo, kde se počítá, kdy zase
--   zaloz_zakazky     - z plánu udělá zakázky na nejbližší dny
--   dokonci_zakazku   - uzavře zakázku a posune plán
--
-- Čistý PostgreSQL. `pg_cron` je jen spouštěč a je v samostatné migraci 0014 -
-- kdyby rozšíření nebylo k dispozici, zaloz_zakazky() se dá volat i ručně
-- a plánovač funguje dál.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Oprava skupiny zakázky z migrace 0011
--
-- Index tam vylučoval jen zrušené zakázky. Při psaní plánovače se ukázalo, že
-- to zadrhne: dokončená zakázka na 8. 9. pro CNC drží klíč skupiny dál, takže
-- úkon, kterému garant nastaví termín na tentýž den až potom, nemá kam přijít.
-- Do dokončené zakázky ho přidat nelze (je uzavřená) a novou založit taky ne
-- (index). Plánovač by ten úkon tiše přeskakoval napořád.
--
-- Skupina je proto nově omezená jen na OTEVŘENÉ zakázky: v jednu chvíli smí
-- být na stroj, den a profesi rozdělaná nejvýš jedna. Hotové a zrušené už nic
-- neblokují, což je správně - obojí je uzavřená kapitola.
--
-- Přibývá i sablona_verze_id. Stroj může mít přiřazených víc šablon (klíčem
-- zarizeni_sablona je dvojice, ne stroj) a zakázka nese verzi jednu jedinou.
-- Bez toho by se úkony ze dvou matic slily do jedné zakázky, která by o sobě
-- tvrdila, že se dělá podle jedné z nich - a rozhodnutí R3 by přestalo platit.
-- Dvě matice tedy znamenají dvě zakázky, každá se svým zamrazeným obsahem.
-- -----------------------------------------------------------------------------

drop index if exists public.zakazka_skupina_unique;

create unique index zakazka_skupina_unique
  on public.zakazka (zarizeni_id, planovany_termin, profese_role_id, sablona_verze_id)
  where stav in ('naplanovano', 'probiha');

-- -----------------------------------------------------------------------------
-- Kdy zase
--
-- Veškerá logika intervalů žije tady a nikde jinde (NAVRH.md kap. 1.3). Rozdíl
-- mezi oběma základy je vidět až u zpožděné údržby:
--
--   od_provedeni - další termín se počítá od skutečného provedení. Mazání
--                  udělané o týden později posune i všechny další termíny.
--   od_planu     - kalendář se nehýbe. Termín zůstává na původní mřížce
--                  (1. 9., 8. 9., 15. 9. …) bez ohledu na to, kdy se stihlo.
--
-- U `od_planu` nestačí přičíst jeden interval: týdenní úkon udělaný o tři
-- týdny později by dostal termín v minulosti a byl by po termínu hned, jak
-- ho technik odklikne. Mřížka se proto posouvá po celých intervalech, dokud
-- termín neminula provedení. Zameškané cykly se přeskočí - to je táž úvaha
-- jako u rozhodnutí, že úkon po termínu nezakládá zakázku každý cyklus znovu.
--
-- Měsíce a roky počítá PostgreSQL kalendářně: 31. 1. + 1 měsíc je 28. 2.
-- Krátký měsíc tedy termín přitáhne a další měsíc už zůstane na 28. Pro
-- údržbu je to přijatelnější než datum, které v půlce roku neexistuje.
-- -----------------------------------------------------------------------------

create or replace function public.dalsi_termin(
  p_planovany date,
  p_provedeno date,
  p_typ       public.interval_typ,
  p_hodnota   integer,
  p_zaklad    public.interval_zaklad
)
returns date
language plpgsql
immutable
as $$
declare
  v_krok  interval;
  v_datum date;
  v_kolo  integer := 0;
begin
  if p_hodnota is null or p_hodnota <= 0 then
    raise exception 'Interval musí být kladný, je %.', p_hodnota using errcode = '22023';
  end if;

  v_krok := case p_typ
    when 'dny'    then make_interval(days   => p_hodnota)
    when 'tydny'  then make_interval(weeks  => p_hodnota)
    when 'mesice' then make_interval(months => p_hodnota)
    when 'roky'   then make_interval(years  => p_hodnota)
  end;

  if p_zaklad = 'od_provedeni' then
    -- Bez data provedení není od čeho počítat; plán se opře o původní termín.
    return (coalesce(p_provedeno, p_planovany) + v_krok)::date;
  end if;

  -- od_planu: nejmíň jeden krok vpřed, pak dokud jsme v minulosti.
  v_datum := (p_planovany + v_krok)::date;

  while p_provedeno is not null and v_datum <= p_provedeno loop
    v_datum := (v_datum + v_krok)::date;

    -- Pojistka proti zacyklení, kdyby se sem někdy dostal interval, který
    -- datum neposouvá. Sto let týdenních cyklů je pět tisíc kol.
    v_kolo := v_kolo + 1;
    if v_kolo > 10000 then
      raise exception 'Výpočet termínu se nesbíhá: plán %, provedeno %.', p_planovany, p_provedeno
        using errcode = '22023';
    end if;
  end loop;

  return v_datum;
end;
$$;

comment on function public.dalsi_termin is
  'Kdy se úkon dělá příště. Jediné místo, kde se počítají intervaly údržby (NAVRH.md kap. 1.3).';

-- -----------------------------------------------------------------------------
-- Zakládání zakázek
--
-- Idempotentní: co je rozdělané, se nezakládá znovu. Zároveň to je ta podmínka,
-- která drží rozhodnutí „úkon po termínu nezakládá zakázku každý cyklus znovu" -
-- dokud otevřená zakázka na daný úkon existuje, plánovač ho přeskočí.
--
-- Zdroj obsahu je PLATNÁ verze šablony, ne ta, podle které se plánovalo
-- posledně. Právě proto se změna matice „automaticky projeví u všech
-- přiřazených zařízení" (zadání ř. 108).
--
-- SECURITY DEFINER, protože běží jménem systému z noční úlohy, kde není žádný
-- přihlášený uživatel. Právo INSERT na zakázky nemá v aplikaci nikdo (0011) -
-- zakázky vznikají jedině tudy.
-- -----------------------------------------------------------------------------

create or replace function public.zaloz_zakazky(p_okno_dnu integer default 14)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_radek   record;
  v_zakazka uuid;
  v_pocet   integer := 0;
begin
  if p_okno_dnu is null or p_okno_dnu < 0 then
    raise exception 'Plánovací okno nemůže být záporné, je %.', p_okno_dnu using errcode = '22023';
  end if;

  for v_radek in
    select
      p.id             as plan_id,
      p.zarizeni_id,
      p.dalsi_termin,
      v.id             as verze_id,
      u.id             as ukon_id,
      u.profese_role_id,
      u.poradi,
      u.nazev,
      u.popis,
      u.kontrolni_body,
      u.vyzaduje_foto,
      u.vyzaduje_hodnotu,
      u.nabizi_poznamku,
      u.jednotka,
      u.mez_min,
      u.mez_max
    from public.plan_udrzby p
    join public.sablona_verze v
      on v.sablona_id = p.sablona_id and v.stav = 'aktivni'
    join public.sablona_ukon u
      on u.sablona_verze_id = v.id and u.klic = p.ukon_klic
    where p.aktivni
      -- Řádek bez termínu čeká na garanta, plánovat se podle něj nedá.
      and p.dalsi_termin is not null
      and p.dalsi_termin <= current_date + p_okno_dnu
      and not exists (
        select 1
        from public.zakazka_ukon zu
        join public.zakazka z on z.id = zu.zakazka_id
        where zu.plan_udrzby_id = p.id
          and z.stav in ('naplanovano', 'probiha')
      )
    order by p.zarizeni_id, p.dalsi_termin, u.profese_role_id, u.poradi
  loop
    -- Zakázka skupiny: stroj, den, profese, verze matice. Otevřenou najdi,
    -- jinak založ. Pořadí v cyklu zaručuje, že se do téže zakázky sejdou
    -- všechny úkony skupiny.
    select id into v_zakazka
    from public.zakazka
    where zarizeni_id      = v_radek.zarizeni_id
      and planovany_termin = v_radek.dalsi_termin
      and profese_role_id  = v_radek.profese_role_id
      and sablona_verze_id = v_radek.verze_id
      and stav in ('naplanovano', 'probiha');

    if v_zakazka is null then
      insert into public.zakazka (
        zarizeni_id, sablona_verze_id, profese_role_id, planovany_termin
      ) values (
        v_radek.zarizeni_id, v_radek.verze_id, v_radek.profese_role_id, v_radek.dalsi_termin
      )
      returning id into v_zakazka;
    end if;

    -- Text úkonu se kopíruje, ne odkazuje: verze se archivuje, šablonu jde
    -- stroji odebrat, a checklist musí zůstat čitelný i pak (R3).
    insert into public.zakazka_ukon (
      zakazka_id, plan_udrzby_id, sablona_ukon_id, poradi,
      nazev_snapshot, popis_snapshot, kontrolni_body,
      vyzaduje_foto, vyzaduje_hodnotu, nabizi_poznamku,
      jednotka_snapshot, mez_min_snapshot, mez_max_snapshot
    ) values (
      v_zakazka, v_radek.plan_id, v_radek.ukon_id, v_radek.poradi,
      v_radek.nazev, v_radek.popis, v_radek.kontrolni_body,
      v_radek.vyzaduje_foto, v_radek.vyzaduje_hodnotu, v_radek.nabizi_poznamku,
      v_radek.jednotka, v_radek.mez_min, v_radek.mez_max
    );

    v_pocet := v_pocet + 1;
  end loop;

  return v_pocet;
end;
$$;

comment on function public.zaloz_zakazky is
  'Založí zakázky pro úkony splatné v plánovacím okně. Idempotentní - rozdělané přeskočí.';

-- -----------------------------------------------------------------------------
-- Dokončení zakázky
--
-- Uzavřít zakázku a posunout plán je jedna nedělitelná věc: kdyby se to udělalo
-- ze dvou volání a druhé selhalo, zůstala by hotová údržba s termínem, který už
-- proběhl - a plánovač by ji naplánoval znovu. supabase-js transakci neumí,
-- proto to sedí v databázi, stejně jako aktivace verze v M2.
--
-- Interval se čte z PLATNÉ verze, ne ze zamrazeného snapshotu. Když garant mezi
-- naplánováním a provedením změnil týdenní úkon na měsíční, další termín má
-- vyjít podle toho nového - to je smysl toho, že se změna matice projeví sama.
-- Snapshot slouží historii, ne dalšímu plánování.
--
-- SECURITY DEFINER kvůli zápisu do plan_udrzby: ten smí jen garant, ale
-- dokončit zakázku má i údržbář. Oprávnění se proto ověřuje ručně hned na
-- začátku - obcházet RLS bez kontroly by z funkce udělalo díru.
-- -----------------------------------------------------------------------------

create or replace function public.dokonci_zakazku(p_zakazka uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_oblast     uuid;
  v_stav       public.stav_zakazky;
  v_nevyrizeno integer;
  v_bez_foto   integer;
  v_radek      record;
begin
  select z.oblast_id, k.stav into v_oblast, v_stav
  from public.zakazka k
  join public.zarizeni z on z.id = k.zarizeni_id
  where k.id = p_zakazka;

  if v_oblast is null then
    raise exception 'Zakázka neexistuje.' using errcode = '23503';
  end if;

  if not public.provadi_udrzbu_v_oblasti(v_oblast) then
    raise exception 'Nemáte oprávnění dokončit údržbu v této oblasti.' using errcode = '42501';
  end if;

  if v_stav not in ('naplanovano', 'probiha') then
    raise exception 'Zakázka už je uzavřená (%).', v_stav using errcode = '23514';
  end if;

  -- Nevyřízený krok znamená, že se na něj zapomnělo. Kdo ho udělat nemohl,
  -- označí ho jako neproveditelný a napíše proč - to je jiný záznam než ticho.
  select count(*) into v_nevyrizeno
  from public.zakazka_ukon
  where zakazka_id = p_zakazka and stav = 'nesplneno';

  if v_nevyrizeno > 0 then
    raise exception 'Zbývá % nevyřízených kroků checklistu.', v_nevyrizeno
      using errcode = '23514';
  end if;

  -- Povinné foto se hlídá až tady, ne u jednotlivého kroku: technik fotí
  -- průběžně a odškrtnout krok dřív, než fotku nahraje, mu nemá co bránit.
  select count(*) into v_bez_foto
  from public.zakazka_ukon u
  where u.zakazka_id = p_zakazka
    and u.vyzaduje_foto
    and u.stav = 'splneno'
    and not exists (
      select 1 from public.zakazka_foto f where f.zakazka_ukon_id = u.id
    );

  if v_bez_foto > 0 then
    raise exception 'U % kroků chybí povinná fotografie.', v_bez_foto
      using errcode = '23514';
  end if;

  -- Posun plánu jen u splněných kroků. Neproveditelný krok se udělat má dál,
  -- takže termín zůstává - a jakmile se zakázka uzavře, plánovač na něj založí
  -- novou. Právě proto uzavřené zakázky skupinu neblokují.
  for v_radek in
    select
      p.id as plan_id,
      k.planovany_termin,
      s.interval_typ,
      s.interval_hodnota,
      s.interval_zaklad
    from public.zakazka_ukon u
    join public.zakazka k       on k.id = u.zakazka_id
    join public.plan_udrzby p   on p.id = u.plan_udrzby_id
    join public.sablona_verze v on v.sablona_id = p.sablona_id and v.stav = 'aktivni'
    join public.sablona_ukon s  on s.sablona_verze_id = v.id and s.klic = p.ukon_klic
    where u.zakazka_id = p_zakazka
      and u.stav = 'splneno'
  loop
    update public.plan_udrzby
    set dalsi_termin = public.dalsi_termin(
          v_radek.planovany_termin,
          current_date,
          v_radek.interval_typ,
          v_radek.interval_hodnota,
          v_radek.interval_zaklad
        ),
        posledni_provedeno_at = now()
    where id = v_radek.plan_id;
  end loop;

  update public.zakazka
  set stav         = 'dokonceno',
      dokonceno_at = now(),
      dokoncil_id  = public.aktualni_uzivatel()
  where id = p_zakazka;
end;
$$;

comment on function public.dokonci_zakazku is
  'Uzavře zakázku a posune plán u splněných kroků. Jedna transakce, ať plán nezůstane pozadu.';

-- -----------------------------------------------------------------------------
-- Práva
--
-- PostgreSQL dává EXECUTE na nové funkce roli PUBLIC, tedy i nepřihlášenému
-- `anon`. U funkcí se SECURITY DEFINER je to podstatný rozdíl, proto se právo
-- nejdřív odebírá a teprve pak uděluje adresně. Týká se to i srovnej_plan
-- z migrace 0010, kde to zůstalo nedodělané.
-- -----------------------------------------------------------------------------

revoke execute on function public.zaloz_zakazky(integer)  from public;
revoke execute on function public.dokonci_zakazku(uuid)   from public;
revoke execute on function public.srovnej_plan(uuid, uuid) from public;

-- Dokončení kontroluje oprávnění samo, uvnitř. Srovnání plánu se volá
-- z triggerů, ale garant ho může potřebovat i ručně.
grant execute on function public.dokonci_zakazku(uuid)     to authenticated;
grant execute on function public.srovnej_plan(uuid, uuid)  to authenticated;

-- dalsi_termin je čistý výpočet bez přístupu k datům - aplikace jím ukazuje
-- garantovi, kdy termín vyjde, ještě než něco uloží.
grant execute on function
  public.dalsi_termin(date, date, public.interval_typ, integer, public.interval_zaklad)
  to authenticated;

-- zaloz_zakazky se schválně nedává nikomu: zakládá zakázky napříč všemi
-- oblastmi a nemá koho se ptát na oprávnění. Spouští ho noční úloha (0014),
-- případně správce ze SQL editoru.
