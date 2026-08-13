-- =============================================================================
-- Vstupní data pro oblast CNC (modul M1).
--
-- Zdroj: docs/Harmonogram_udrzby_CNC_stroju.xlsx, sloupec "Stroj".
-- Tabulka obsahuje pět strojů a k nim harmonogram úkonů údržby. Úkony samotné
-- se sem nepřenášejí - jsou to šablony a patří do modulu M2. Odsud je jen to,
-- co je evidence: jaké stroje v CNC oblasti stojí.
--
-- Skript je idempotentní, lze jej pustit opakovaně. Nic nepřepisuje, co
-- uživatel doplní v aplikaci - u zařízení pozná už založený stroj podle typu.
--
-- POZOR na dvě věci, které z tabulky nevyčteme a musí je doplnit garant:
--   1. inventární čísla, výrobce, model, rok výroby a přesné umístění,
--   2. vlastní technické parametry typů (schema_parametru zůstává prázdné).
-- =============================================================================

-- Typy zařízení --------------------------------------------------------------
-- Pět kódů odpovídá pěti druhům strojů z tabulky. Až přibude druhá frézka,
-- založí se jako další zařízení téhož typu - to je smysl oddělení typ/zařízení.

insert into public.typ_zarizeni (oblast_id, kod, nazev, popis)
select
  o.id,
  v.kod,
  v.nazev,
  v.popis
from public.oblast o
cross join (values
  ('frezka',      'Frézka',      'CNC frézka.'),
  ('soustruh',    'Soustruh',    'CNC soustruh.'),
  ('vysekavacka', 'Vysekávačka', 'CNC vysekávací stroj.'),
  ('ohranovak',   'Ohraňovák',   'CNC ohraňovací lis.'),
  -- Zařazení do CNC vychází z dodané tabulky. Jestli licí stroj patří spíš do
  -- strojní údržby, je to změna oblast_id u tohoto typu, nic víc.
  ('lici_stroj',  'Licí stroj',  'Licí stroj vedený v harmonogramu CNC.')
) as v(kod, nazev, popis)
where o.kod = 'cnc'
on conflict (kod) do update
  set nazev = excluded.nazev,
      popis = excluded.popis;

-- Zařízení -------------------------------------------------------------------
-- Podle zadání jde o konkrétní stroje ve výrobě, od každého druhu zatím jeden.
-- Zakládají se bez inventárního čísla; jakmile je garant doplní, stane se
-- jedinečným identifikátorem stroje. Umístění míří na kořen areálu, dokud
-- nebude nahraná skutečná struktura hal (docs/PRIPRAVA_DAT.md).

insert into public.zarizeni (oblast_id, typ_zarizeni_id, nazev, umisteni_id, stav, poznamka)
select
  t.oblast_id,
  t.id,
  t.nazev,
  u.id,
  'v_provozu'::public.stav_zarizeni,
  'Založeno ze souboru Harmonogram_udrzby_CNC_stroju.xlsx. Doplňte inventární číslo a umístění.'
from public.typ_zarizeni t
left join public.umisteni u on u.kod = 'AREAL'
where t.kod in ('frezka', 'soustruh', 'vysekavacka', 'ohranovak', 'lici_stroj')
  and not exists (
    select 1 from public.zarizeni z where z.typ_zarizeni_id = t.id
  );
