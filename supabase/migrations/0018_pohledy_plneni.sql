-- =============================================================================
-- M4 - odvozené pohledy pro dashboard a plnění matice
--
-- Odpovídá docs/NAVRH.md kap. 2.7. Výpočet žije v databázi, ne v aplikaci:
-- dashboard, obrazovka plnění a export do XLSX musí ukázat totéž číslo, a to
-- se zaručí jedním výpočtem, ne třemi shodně napsanými.
--
-- VŠECHNY pohledy jsou `security_invoker = true`. Bez toho by se politiky
-- vyhodnocovaly jménem vlastníka pohledu a specialista CNC by přes pohled
-- viděl celý podnik - RLS by se dala obejít prostým selectem. Je to
-- nejdůležitější řádek v celém souboru.
--
-- Jak se počítá plnění (rozhodnutí uživatele z 19. 8. 2026):
--
--   * Bez tolerance. Po termínu je po termínu. Sloupec tolerance_dny_snapshot
--     se respektuje, ale je všude nula.
--   * „Nelze provést" se z výpočtu vyřadí ÚPLNĚ - ani do čitatele, ani do
--     jmenovatele. Vykazuje se vedle vlastním číslem, aby nezmizelo z dohledu.
--     Bez toho by stroj měsíc v opravě srazil plnění oblasti na polovinu.
--   * Období podle PLÁNOVANÉHO termínu, ne podle data provedení. Úkon plánovaný
--     na 31. 8. a udělaný 2. 9. patří do srpna.
--   * Do jmenovatele jen to, co už bylo splatné k dnešku. Jinak by 1. v měsíci
--     vždycky ukazoval 0 % a číslo za probíhající měsíc by skokově klesalo
--     pokaždé, když v noci proběhne plánovač - termín za tři týdny totiž
--     zakázku ještě nemá, plánovací okno je 14 dnů.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Dnešní plán
--
-- Zakázka, ne jednotlivý úkon: zakázka je jedna cesta technika ke stroji a to
-- je jednotka práce, kterou si někdo bere. Rozpad na kroky je až v checklistu.
-- -----------------------------------------------------------------------------

create or replace view public.v_dnesni_plan
with (security_invoker = true) as
select
  k.id                        as zakazka_id,
  k.zarizeni_id,
  z.oblast_id,
  z.nazev                     as zarizeni_nazev,
  z.inventarni_cislo,
  k.planovany_termin,
  k.stav,
  k.prirazeno_uzivateli_id,
  k.profese_role_id,
  r.nazev                     as profese_nazev,
  count(u.id)                 as kroku,
  count(u.id) filter (where u.stav <> 'nesplneno') as vyrizeno
from public.zakazka k
join public.zarizeni z on z.id = k.zarizeni_id
join public.role r     on r.id = k.profese_role_id
left join public.zakazka_ukon u on u.zakazka_id = k.id
where k.stav in ('naplanovano', 'probiha')
  and k.planovany_termin = current_date
group by k.id, z.id, r.nazev;

comment on view public.v_dnesni_plan is
  'Otevřené zakázky splatné dnes. Podklad pro dashboard (NAVRH.md kap. 5.1).';

-- -----------------------------------------------------------------------------
-- Po termínu
--
-- Tolerance se sem schválně nepromítá. Restanci technik vidí od prvního dne
-- po termínu; tolerance je věc VÝKAZU plnění, ne toho, co je potřeba udělat.
-- -----------------------------------------------------------------------------

create or replace view public.v_po_terminu
with (security_invoker = true) as
select
  k.id                        as zakazka_id,
  k.zarizeni_id,
  z.oblast_id,
  z.nazev                     as zarizeni_nazev,
  z.inventarni_cislo,
  k.planovany_termin,
  k.stav,
  k.prirazeno_uzivateli_id,
  k.profese_role_id,
  r.nazev                     as profese_nazev,
  (current_date - k.planovany_termin) as dnu_zpozdeni,
  count(u.id)                 as kroku,
  count(u.id) filter (where u.stav <> 'nesplneno') as vyrizeno
from public.zakazka k
join public.zarizeni z on z.id = k.zarizeni_id
join public.role r     on r.id = k.profese_role_id
left join public.zakazka_ukon u on u.zakazka_id = k.id
where k.stav in ('naplanovano', 'probiha')
  and k.planovany_termin < current_date
group by k.id, z.id, r.nazev;

comment on view public.v_po_terminu is
  'Otevřené zakázky po termínu i s počtem dnů zpoždění (NAVRH.md kap. 2.7).';

-- -----------------------------------------------------------------------------
-- Plnění matice
--
-- Jeden řádek na oblast a měsíc. Počítá se po KROCÍCH, ne po zakázkách:
-- zakázka sdružuje několik úkonů a plnění matice je o úkonech - jinak by
-- zakázka o šesti krocích vážila stejně jako zakázka o jednom.
--
-- Splněno = krok má stav 'splneno' a byl potvrzený nejpozději v termínu
-- (plus tolerance). Nepožaduje se uzavřená zakázka: technik krok odklikl, práce
-- proběhla. Že zakázku zapomněl odeslat, je jiný problém a je vidět v plánu
-- mezi rozdělanými.
--
-- Čas potvrzení se převádí do pásma závodu. Bez toho by se u zápisů kolem
-- půlnoci rozcházel den v databázi (UTC) se dnem, kdy technik u stroje stál.
-- -----------------------------------------------------------------------------

create or replace view public.v_plneni_matice
with (security_invoker = true) as
select
  z.oblast_id,
  date_trunc('month', k.planovany_termin)::date as obdobi,
  count(*) filter (where u.stav <> 'nelze_provest') as celkem,
  count(*) filter (
    where u.stav = 'splneno'
      and (u.potvrzeno_at at time zone 'Europe/Prague')::date
          <= k.planovany_termin + u.tolerance_dny_snapshot
  ) as splneno,
  count(*) filter (
    where u.stav <> 'nelze_provest'
      and not (
        u.stav = 'splneno'
        and (u.potvrzeno_at at time zone 'Europe/Prague')::date
            <= k.planovany_termin + u.tolerance_dny_snapshot
      )
  ) as po_terminu,
  count(*) filter (where u.stav = 'nelze_provest') as neprovedeno
from public.zakazka_ukon u
join public.zakazka k  on k.id = u.zakazka_id
join public.zarizeni z on z.id = k.zarizeni_id
-- Zrušená zakázka není nesplněná údržba, je to zrušený plán.
where k.stav <> 'zruseno'
  -- Jen to, co už mělo být hotové. Budoucí termíny se nepočítají.
  and k.planovany_termin <= current_date
group by z.oblast_id, date_trunc('month', k.planovany_termin);

comment on view public.v_plneni_matice is
  'Plnění matice za oblast a měsíc. Splněno/celkem, po termínu a neprovedené vedle (NAVRH.md kap. 2.7).';

-- -----------------------------------------------------------------------------
-- Práva
--
-- Pohledy dědí přístup od tabulek pod sebou díky security_invoker, ale právo
-- SELECT na samotný pohled se udělit musí.
-- -----------------------------------------------------------------------------

revoke all on public.v_dnesni_plan, public.v_po_terminu, public.v_plneni_matice from anon;

grant select on public.v_dnesni_plan, public.v_po_terminu, public.v_plneni_matice to authenticated;
