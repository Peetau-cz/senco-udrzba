-- =============================================================================
-- Číselníky - oblasti údržby a role ze zadání.
--
-- Skript je idempotentní, lze jej pustit opakovaně.
-- Testovací uživatele zakládá scripts/seed-users.mjs - hesla spravuje Supabase
-- Auth, čistým SQL je založit nelze.
-- =============================================================================

-- Oblasti údržby (zadání ř. 20-36)
insert into public.oblast (kod, nazev, poradi) values
  ('cnc',      'Údržba CNC strojů',        1),
  ('strojni',  'Údržba strojních zařízení', 2),
  ('elektro',  'Údržba elektro zařízení',   3),
  ('vzv',      'Údržba VZV',                4),
  ('lakovna',  'Údržba procesu lakování',   5)
on conflict (kod) do update
  set nazev = excluded.nazev,
      poradi = excluded.poradi;

-- Uživatelské role (zadání ř. 42-49)
insert into public.role (kod, nazev, popis, poradi) values
  ('administrator',       'Administrátor',      'Správa uživatelů, rolí a číselníků. Přístup ke všem oblastem.', 1),
  ('vedouci_udrzby',      'Vedoucí údržby',     'Přístup ke všem oblastem, řízení plánu a šablon.',             2),
  ('specialista_cnc',     'Specialista CNC',    'Garant oblasti CNC strojů.',                                   3),
  ('specialista_elektro', 'Specialista elektro','Garant oblasti elektro zařízení.',                             4),
  ('udrzbar',             'Údržbář',            'Provádí údržbu, zapisuje do provozního deníku.',               5),
  ('vedouci_lakovny',     'Vedoucí lakovny',    'Garant oblasti lakování.',                                     6),
  ('pracovnik_skladu',    'Pracovník skladu',   'Garant oblasti VZV.',                                          7),
  ('management',          'Management',         'Pouze čtení. Přístup ke všem oblastem.',                       8),
  ('kiosek',              'Kiosek',             'Účet dotykového zařízení v dílně. Odklikává zakázky a zapisuje do deníku ve své oblasti.', 9)
on conflict (kod) do update
  set nazev = excluded.nazev,
      popis = excluded.popis,
      poradi = excluded.poradi;

-- Kořen stromu umístění. Skutečnou strukturu hal a provozů doplní import
-- podle docs/PRIPRAVA_DAT.md, až ji vedoucí údržby odsouhlasí.
insert into public.umisteni (kod, nazev, nadrazene_id) values
  ('AREAL', 'Areál SENCO Příbram', null)
on conflict (kod) do nothing;
