-- =============================================================================
-- M4 - tolerance zamrazená v zakázce
--
-- Výpočet plnění potřebuje vědět, kolik dní po termínu se úkon ještě počítá
-- jako splněný. Sloupec `tolerance_dny` na tom je od migrace 0006, ale zakázka
-- si ho nezkopírovala - a bez kopie by se musel dohledávat v živé matici.
--
-- To by nešlo ze dvou důvodů. Zaprvé se šablona dá stroji odebrat a verze
-- archivovat, takže by u starých zakázek nebylo kde hledat. Zadruhé a hlavně:
-- kdyby garant toleranci dodatečně zvedl, změnila by se zpětně čísla za měsíce,
-- které jsou dávno uzavřené. Tolerance je součást toho, co v době plánování
-- platilo - patří tedy mezi ostatní sloupce _snapshot (rozhodnutí R3).
--
-- Rozhodnutí uživatele z 19. 8. 2026: žádná tolerance se nezavádí, po termínu
-- je po termínu. Sloupec ale zůstává a výpočet ho respektuje - je všude nula,
-- takže se chová přesně tak, a kdyby ji garant někdy u jednoho úkonu chtěl,
-- nemusí se sahat do schématu ani do výpočtu.
-- =============================================================================

alter table public.zakazka_ukon
  add column if not exists tolerance_dny_snapshot integer not null default 0;

alter table public.zakazka_ukon
  drop constraint if exists zakazka_ukon_tolerance_nezaporna;

alter table public.zakazka_ukon
  add constraint zakazka_ukon_tolerance_nezaporna check (tolerance_dny_snapshot >= 0);

comment on column public.zakazka_ukon.tolerance_dny_snapshot is
  'Kolik dní po termínu se krok ještě počítá jako splněný. Zamrazené z matice, ať pozdější úprava nepřepíše uzavřené měsíce.';

-- -----------------------------------------------------------------------------
-- Dosavadní zakázky
--
-- Doplní se z úkonu, ze kterého zakázka vznikla. Archivovaná verze se nemaže,
-- takže dohledat ho jde i zpětně; u kroků, kterým odkaz zplaněl na null,
-- zůstane nula. Dnes je to bez vlivu - tolerance je v celé databázi nulová -
-- ale nechat to na příště by znamenalo počítat s daty, o kterých víme, že
-- můžou být špatně.
--
-- Zámek uzavřené zakázky z migrace 0011 by tenhle UPDATE zarazil, a právem:
-- obsah hotové zakázky se měnit nesmí. Tady jde o doplnění sloupce při migraci
-- schématu, ne o změnu toho, co technik odškrtal. Zámek se proto na dobu
-- převodu vypne a hned zase zapne - stejně jako u kontrolních bodů v 0007.
-- -----------------------------------------------------------------------------

alter table public.zakazka_ukon disable trigger zakazka_ukon_zamek;

update public.zakazka_ukon u
set tolerance_dny_snapshot = s.tolerance_dny
from public.sablona_ukon s
where s.id = u.sablona_ukon_id
  and s.tolerance_dny <> u.tolerance_dny_snapshot;

alter table public.zakazka_ukon enable trigger zakazka_ukon_zamek;

-- -----------------------------------------------------------------------------
-- Plánovač kopíruje toleranci spolu se zbytkem
--
-- Tělo je jinak beze změny oproti migraci 0015. Opakuje se celé, protože
-- `create or replace function` částečnou úpravu neumí.
--
-- Poučení, které tu už jednou padlo u nabizi_poznamku (migrace 0010): kdo
-- přidá sloupec do matice nebo do checklistu, musí ho doplnit i sem.
-- -----------------------------------------------------------------------------

create or replace function public.zaloz_zakazky(
  p_okno_dnu integer default 14,
  p_zarizeni uuid default null
)
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
      u.mez_max,
      u.tolerance_dny
    from public.plan_udrzby p
    join public.sablona_verze v
      on v.sablona_id = p.sablona_id and v.stav = 'aktivni'
    join public.sablona_ukon u
      on u.sablona_verze_id = v.id and u.klic = p.ukon_klic
    where p.aktivni
      -- Null = celá databáze, tedy noční úloha.
      and (p_zarizeni is null or p.zarizeni_id = p_zarizeni)
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
      jednotka_snapshot, mez_min_snapshot, mez_max_snapshot, tolerance_dny_snapshot
    ) values (
      v_zakazka, v_radek.plan_id, v_radek.ukon_id, v_radek.poradi,
      v_radek.nazev, v_radek.popis, v_radek.kontrolni_body,
      v_radek.vyzaduje_foto, v_radek.vyzaduje_hodnotu, v_radek.nabizi_poznamku,
      v_radek.jednotka, v_radek.mez_min, v_radek.mez_max, v_radek.tolerance_dny
    );

    v_pocet := v_pocet + 1;
  end loop;

  return v_pocet;
end;
$$;

comment on function public.zaloz_zakazky is
  'Založí zakázky pro úkony splatné v plánovacím okně, volitelně jen pro jeden stroj. Idempotentní.';

-- Sloupcová práva z migrace 0011 se nemění: tolerance je snapshot a technik ji
-- přepisovat nesmí. `grant update (...)` je výčtový, takže nový sloupec do něj
-- sám nespadne - uvedeno pro jistotu, aby to nikdo nehledal.
