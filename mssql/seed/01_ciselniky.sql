-- =============================================================================
-- Číselníky: oblasti údržby, role a kořen stromu umístění (ze zadání).
--
-- Idempotentní: existující řádek dostane nový název a pořadí jen tehdy, když
-- se liší, takže opakované spuštění nenaplní audit prázdnými změnami.
-- Běží jako vlastník databáze (npm run mssql:seed); osoby s hesly zakládá
-- scripts/mssql-seed.mjs, protože hash hesla počítá Node.
-- =============================================================================

-- Oblasti údržby (zadání ř. 20-36) -------------------------------------------
merge dbo.oblast as cil
using (values
  (N'cnc',     N'Údržba CNC strojů',        1),
  (N'strojni', N'Údržba strojních zařízení', 2),
  (N'elektro', N'Údržba elektro zařízení',   3),
  (N'vzv',     N'Údržba VZV',                4),
  (N'lakovna', N'Údržba procesu lakování',   5)
) as zdroj (kod, nazev, poradi)
on cil.kod = zdroj.kod
when matched and (cil.nazev <> zdroj.nazev or cil.poradi <> zdroj.poradi) then
  update set nazev = zdroj.nazev, poradi = zdroj.poradi
when not matched then
  insert (kod, nazev, poradi) values (zdroj.kod, zdroj.nazev, zdroj.poradi);

-- Uživatelské role (zadání ř. 42-49) -----------------------------------------
merge dbo.[role] as cil
using (values
  (N'administrator',       N'Administrátor',       N'Správa uživatelů, rolí a číselníků. Přístup ke všem oblastem.', 1),
  (N'vedouci_udrzby',      N'Vedoucí údržby',      N'Přístup ke všem oblastem, řízení plánu a šablon.',             2),
  (N'specialista_cnc',     N'Specialista CNC',     N'Garant oblasti CNC strojů.',                                   3),
  (N'specialista_elektro', N'Specialista elektro', N'Garant oblasti elektro zařízení.',                             4),
  (N'udrzbar',             N'Údržbář',             N'Provádí údržbu, zapisuje do provozního deníku.',               5),
  (N'vedouci_lakovny',     N'Vedoucí lakovny',     N'Garant oblasti lakování.',                                     6),
  (N'pracovnik_skladu',    N'Pracovník skladu',    N'Garant oblasti VZV.',                                          7),
  (N'management',          N'Management',          N'Pouze čtení. Přístup ke všem oblastem.',                       8)
) as zdroj (kod, nazev, popis, poradi)
on cil.kod = zdroj.kod
when matched and (cil.nazev <> zdroj.nazev or isnull(cil.popis, N'') <> zdroj.popis or cil.poradi <> zdroj.poradi) then
  update set nazev = zdroj.nazev, popis = zdroj.popis, poradi = zdroj.poradi
when not matched then
  insert (kod, nazev, popis, poradi) values (zdroj.kod, zdroj.nazev, zdroj.popis, zdroj.poradi);

-- Kořen stromu umístění ------------------------------------------------------
-- Haly a provozy doplňuje 02_umisteni.sql.
if not exists (select 1 from dbo.umisteni where kod = N'AREAL')
  insert into dbo.umisteni (kod, nazev, nadrazene_id)
  values (N'AREAL', N'Areál SENCO Příbram', null);

-- Druhy zásahu (M5) - stejná šestice, kterou zakládala migrace 0020 --------
merge dbo.druh_zasahu as cil
using (values
  (N'vymena_zarovky', N'Výměna žárovky', 1),
  (N'dotazeni_krytu', N'Dotažení krytu', 2),
  (N'vymena_hadice',  N'Výměna hadice',  3),
  (N'oprava_snimace', N'Oprava snímače', 4),
  (N'serizeni',       N'Seřízení',       5),
  (N'cisteni',        N'Čištění',        6)
) as zdroj (kod, nazev, poradi)
on cil.kod = zdroj.kod
when not matched then
  insert (kod, nazev, poradi) values (zdroj.kod, zdroj.nazev, zdroj.poradi);

print N'01_ciselniky: oblasti, role, kořen umístění a druhy zásahu jsou na místě.';
