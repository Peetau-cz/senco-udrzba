-- =============================================================================
-- Připravenost zařízení - má stroj dodělaný plán údržby?
--
-- Řeší tichou díru z M3. Přiřazení šablony založí triggerem řádky v
-- plan_udrzby pro každý úkon matice, ale `dalsi_termin` nechá prázdný - první
-- termín zadává garant u každého úkonu zvlášť. A plánovač řádek bez termínu
-- PŘESKAKUJE (částečný index z migrace 0010: `where aktivni and dalsi_termin
-- is not null`).
--
-- Stroj s osmi úkony a vyplněnými pěti termíny proto vypadá v evidenci
-- pokrytě, tři úkony se ale nenaplánují nikdy a nikde to není vidět. Tenhle
-- pohled to vytahuje na povrch.
--
-- `security_invoker = true` jako u pohledů z migrace 0018. Bez toho by se
-- politiky vyhodnocovaly jménem vlastníka pohledu a specialista CNC by přes
-- pohled viděl celý podnik. Je to nejdůležitější řádek v souboru a test ho
-- ověřuje zvlášť, protože jeho porušení není vidět na číslech.
--
-- Pohled kontroluje JEN STROJE V PROVOZU (rozhodnutí uživatele 20. 8. 2026).
-- Odstavený, v opravě ani vyřazený stroj se dnes plánovat nedá - výstraha u něj
-- není práce, kterou by šlo udělat, jen šum, ve kterém zapadnou stroje, se
-- kterými se něco dělat dá.
--
-- Nic se tím natrvalo neztratí: stav se počítá živě, takže jakmile se stroj
-- vrátí do provozu, výstraha se objeví sama. Proto je podmínka na stavu tady
-- v pohledu a ne v aplikaci - jinak by se počet na dlaždici dashboardu rozešel
-- s délkou seznamu, do kterého ta dlaždice odkazuje.
-- =============================================================================

create or replace view public.v_pripravenost_zarizeni
with (security_invoker = true) as
select
  z.id        as zarizeni_id,
  z.oblast_id,
  sab.pocet   as sablon,
  pl.celkem   as ukonu_celkem,
  pl.bez_terminu as ukonu_bez_terminu,
  -- Pořadí větví je pořadím naléhavosti. Stroj bez šablony je jinde než stroj,
  -- kterému chybí termín u dvou úkonů z osmi, a mísit obojí do jednoho
  -- „nedoděláno" by zakrylo, co se má udělat dřív.
  case
    when sab.pocet = 0        then 'bez_sablony'
    when pl.celkem = 0        then 'bez_ukonu'
    when pl.bez_terminu > 0   then 'bez_terminu'
    else 'ok'
  end as stav_planu
from public.zarizeni z
-- Laterální poddotazy, ne dva joiny s group by: stroj může mít víc šablon
-- a přímý join by řádky plánu vynásobil jejich počtem. `count(distinct)` by to
-- zachránil taky, ale tenhle zápis tu past neotevírá vůbec.
left join lateral (
  select count(*) as pocet
  from public.zarizeni_sablona zs
  where zs.zarizeni_id = z.id
) sab on true
left join lateral (
  select
    count(*)                                       as celkem,
    count(*) filter (where p.dalsi_termin is null) as bez_terminu
  from public.plan_udrzby p
  where p.zarizeni_id = z.id
    -- Neaktivní úkon garant z matice vyřadil novou verzí. Chybějící termín
    -- u něj nikomu nevadí - naplánovat se už nemá.
    and p.aktivni
) pl on true
where z.stav = 'v_provozu';

comment on view public.v_pripravenost_zarizeni is
  'Má stroj dodělaný plán údržby? stav_planu: bez_sablony | bez_ukonu | bez_terminu | ok. '
  'Jen stroje v provozu - odstavené, v opravě a vyřazené pohled vynechává.';

grant select on public.v_pripravenost_zarizeni to authenticated;
