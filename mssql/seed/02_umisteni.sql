-- =============================================================================
-- Struktura areálu SENCO Příbram: haly a provozy.
--
-- Dvě úrovně pod kořenem: hala, v ní provoz. Provozy nesou názvy oblastí
-- údržby, protože tak je závod rozdělený i fyzicky. Kód provozu má kód haly
-- jako předponu (src/lib/umisteni/kod.ts), aby šla stejně pojmenovaná linka
-- založit ve dvou halách.
--
-- Idempotentní: nepřepisuje názvy změněné v aplikaci, hlídá jen, že uzel
-- existuje a visí na správném místě. Vyžaduje kořen AREAL z 01_ciselniky.sql.
-- =============================================================================

-- Haly ------------------------------------------------------------------------
insert into dbo.umisteni (kod, nazev, nadrazene_id)
select v.kod, v.nazev, koren.id
from dbo.umisteni koren
cross join (values
  (N'HALA_A', N'Hala A'),
  (N'HALA_B', N'Hala B'),
  (N'HALA_C', N'Hala C')
) as v (kod, nazev)
where koren.kod = N'AREAL'
  and not exists (select 1 from dbo.umisteni u where u.kod = v.kod);

-- Provozy ---------------------------------------------------------------------
insert into dbo.umisteni (kod, nazev, nadrazene_id)
select v.kod, v.nazev, hala.id
from dbo.umisteni hala
join (values
  (N'HALA_A', N'HALA_A_CNC',     N'CNC'),
  (N'HALA_A', N'HALA_A_VZV',     N'VZV'),
  (N'HALA_B', N'HALA_B_STROJNI', N'Strojní'),
  (N'HALA_B', N'HALA_B_ELEKTRO', N'Elektro'),
  (N'HALA_C', N'HALA_C_LAKOVNA', N'Lakovna')
) as v (kod_haly, kod, nazev) on v.kod_haly = hala.kod
where not exists (select 1 from dbo.umisteni u where u.kod = v.kod);

print N'02_umisteni: haly a provozy jsou na místě.';
