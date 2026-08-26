-- =============================================================================
-- M5 - kompletní historie zařízení
--
-- Zadání ř. 146-154: každé zařízení má mít jednu historii, ve které je všechno -
-- plánované údržby, záznamy z provozního deníku, fotografie, poznámky, kdo a kdy.
-- Návrh na to má pohled v_historie_zarizeni (kap. 2.5 a 2.7).
--
-- Tady se ty dva světy potkávají POPRVÉ a naposledy - a jen při čtení. Rozhodnutí
-- R4 říká, že deník neovlivňuje plán ani plnění matice; kdyby se sjednocovaly
-- při zápisu (společná tabulka, trigger, cokoli), R4 by se dřív nebo později
-- porušilo. Pohled je proto jediné správné místo: čte obojí, nemění nic.
--
-- `security_invoker = true` jako u pohledů z migrace 0018 a 0019. Bez toho by se
-- politiky vyhodnotily jménem vlastníka pohledu a specialista CNC by přes
-- historii viděl celý podnik. Test to ověřuje zvlášť - porušení není vidět
-- na číslech.
--
-- V historii jsou jen DOKONČENÉ zakázky. Otevřená zakázka je práce, která se má
-- teprve udělat, a patří do plánu; zrušená je práce, která se neudělala. Ani
-- jedno není záznam o tom, co se se strojem dělo - a smíchat je do jedné osy by
-- znamenalo, že „historie" tvrdí něco, co se nestalo.
-- =============================================================================

create or replace view public.v_historie_zarizeni
with (security_invoker = true) as

-- Plánovaná údržba ------------------------------------------------------------
select
  'udrzba'::text          as puvod,
  k.id                    as zaznam_id,
  k.zarizeni_id,
  z.oblast_id,
  k.dokonceno_at          as kdy,
  -- Název šablony, ne názvy jednotlivých kroků: v časové ose je jedna zakázka
  -- jedna událost („Údržba CNC frézky"), rozpad na kroky patří do jejího detailu.
  s.nazev                 as nazev,
  k.poznamka              as popis,
  k.dokoncil_id           as provedl_id,
  null::uuid              as zapsal_id,
  null::integer           as doba_trvani_min,
  u.celkem                as ukonu_celkem,
  u.splneno               as ukonu_splneno,
  u.neprovedeno           as ukonu_neprovedeno,
  f.pocet                 as fotek
from public.zakazka k
join public.zarizeni z      on z.id = k.zarizeni_id
join public.sablona_verze v on v.id = k.sablona_verze_id
join public.sablona s       on s.id = v.sablona_id
-- Laterální poddotazy ze stejného důvodu jako v migraci 0019: přímý join na
-- kroky a na fotky by řádky vynásobil mezi sebou a počty by vyšly nesmyslně.
left join lateral (
  select
    count(*)                                          as celkem,
    count(*) filter (where uk.stav = 'splneno')       as splneno,
    count(*) filter (where uk.stav = 'nelze_provest') as neprovedeno
  from public.zakazka_ukon uk
  where uk.zakazka_id = k.id
) u on true
left join lateral (
  select count(*) as pocet
  from public.zakazka_foto zf
  join public.zakazka_ukon uk on uk.id = zf.zakazka_ukon_id
  where uk.zakazka_id = k.id
) f on true
where k.stav = 'dokonceno'

union all

-- Provozní deník --------------------------------------------------------------
select
  'denik'::text           as puvod,
  d.id                    as zaznam_id,
  d.zarizeni_id,
  d.oblast_id,
  d.provedeno_at          as kdy,
  dz.nazev                as nazev,
  d.popis                 as popis,
  d.provedl_id,
  d.zapsal_id,
  d.doba_trvani_min,
  -- Zásah z deníku nemá checklist. Nula by tvrdila, že měl a byl prázdný.
  null::bigint            as ukonu_celkem,
  null::bigint            as ukonu_splneno,
  null::bigint            as ukonu_neprovedeno,
  fd.pocet                as fotek
from public.provozni_denik d
join public.druh_zasahu dz on dz.id = d.druh_zasahu_id
left join lateral (
  select count(*) as pocet
  from public.denik_foto df
  where df.zaznam_id = d.id
) fd on true;

comment on view public.v_historie_zarizeni is
  'Jedna časová osa zařízení: dokončené zakázky a zápisy z provozního deníku (zadání ř. 146-154). '
  'puvod: udrzba | denik. Řadí se podle sloupce kdy sestupně - pohled sám pořadí neurčuje.';

grant select on public.v_historie_zarizeni to authenticated;
