-- =============================================================================
-- Vstupní data pro oblast CNC (modul M1): typy zařízení a stroje.
--
-- Zdroj: docs/Harmonogram_udrzby_CNC_stroju.xlsx, sloupec "Stroj". Úkony
-- z téhož souboru jsou šablona (04_sablony_cnc.sql), sem patří jen evidence.
--
-- Idempotentní. Nepřepisuje, co uživatel doplní v aplikaci - stroj pozná
-- podle typu. Inventární čísla, výrobce, model a přesné umístění doplní garant.
-- =============================================================================

-- Typy zařízení --------------------------------------------------------------
merge dbo.typ_zarizeni as cil
using (
  select o.id as oblast_id, v.kod, v.nazev, v.popis
  from dbo.oblast o
  cross join (values
    (N'frezka',      N'Frézka',      N'CNC frézka.'),
    (N'soustruh',    N'Soustruh',    N'CNC soustruh.'),
    (N'vysekavacka', N'Vysekávačka', N'CNC vysekávací stroj.'),
    (N'ohranovak',   N'Ohraňovák',   N'CNC ohraňovací lis.'),
    -- Zařazení licího stroje do CNC vychází z dodané tabulky; kdyby patřil do
    -- strojní údržby, je to změna oblast_id u tohoto typu, nic víc.
    (N'lici_stroj',  N'Licí stroj',  N'Licí stroj vedený v harmonogramu CNC.')
  ) as v (kod, nazev, popis)
  where o.kod = N'cnc'
) as zdroj
on cil.kod = zdroj.kod
when matched and (cil.nazev <> zdroj.nazev or isnull(cil.popis, N'') <> zdroj.popis) then
  update set nazev = zdroj.nazev, popis = zdroj.popis
when not matched then
  insert (oblast_id, kod, nazev, popis) values (zdroj.oblast_id, zdroj.kod, zdroj.nazev, zdroj.popis);

-- Zařízení -------------------------------------------------------------------
-- Od každého druhu jeden stroj, bez inventárního čísla, umístěný na kořen
-- areálu, dokud garant nedoplní skutečnou halu.
insert into dbo.zarizeni (oblast_id, typ_zarizeni_id, nazev, umisteni_id, stav, poznamka)
select
  t.oblast_id,
  t.id,
  t.nazev,
  u.id,
  N'v_provozu',
  N'Založeno ze souboru Harmonogram_udrzby_CNC_stroju.xlsx. Doplňte inventární číslo a umístění.'
from dbo.typ_zarizeni t
left join dbo.umisteni u on u.kod = N'AREAL'
where t.kod in (N'frezka', N'soustruh', N'vysekavacka', N'ohranovak', N'lici_stroj')
  and not exists (select 1 from dbo.zarizeni z where z.typ_zarizeni_id = t.id);

print N'03_cnc: typy a stroje CNC jsou na místě.';
