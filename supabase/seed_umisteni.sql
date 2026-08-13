-- =============================================================================
-- Struktura areálu SENCO Příbram - haly a provozy.
--
-- Dvě úrovně pod kořenem: hala, v ní provoz. Provozy jsou pojmenované podle
-- oblastí údržby, protože tak je závod rozdělený i fyzicky - v hale A stojí
-- CNC stroje a VZV, v hale B strojní a elektro, v hale C lakovna.
--
-- Kódy odpovídají tomu, co by vygenerovala obrazovka /nastaveni/umisteni
-- (src/lib/umisteni/kod.ts): kód provozu nese kód haly jako předponu, aby šla
-- stejně pojmenovaná linka založit ve dvou halách.
--
-- Skript je idempotentní, lze jej pustit opakovaně. Nepřepisuje názvy, které
-- někdo změnil v aplikaci - hlídá jen, že uzel existuje a visí na správném místě.
-- =============================================================================

-- Haly ------------------------------------------------------------------------
insert into public.umisteni (kod, nazev, nadrazene_id)
select v.kod, v.nazev, koren.id
from public.umisteni koren
cross join (values
  ('HALA_A', 'Hala A'),
  ('HALA_B', 'Hala B'),
  ('HALA_C', 'Hala C')
) as v(kod, nazev)
where koren.kod = 'AREAL'
on conflict (kod) do nothing;

-- Provozy ---------------------------------------------------------------------
-- Nadřazená hala se hledá podle kódu, ne podle pořadí, aby na tom skript
-- nezávisel, kdyby se haly zakládaly ručně.
insert into public.umisteni (kod, nazev, nadrazene_id)
select v.kod, v.nazev, hala.id
from public.umisteni hala
join (values
  ('HALA_A', 'HALA_A_CNC',     'CNC'),
  ('HALA_A', 'HALA_A_VZV',     'VZV'),
  ('HALA_B', 'HALA_B_STROJNI', 'Strojní'),
  ('HALA_B', 'HALA_B_ELEKTRO', 'Elektro'),
  ('HALA_C', 'HALA_C_LAKOVNA', 'Lakovna')
) as v(kod_haly, kod, nazev) on v.kod_haly = hala.kod
on conflict (kod) do nothing;
