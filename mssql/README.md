# Databáze na SQL Serveru

Sem patří všechno, co se pouští proti SQL Serveru. Rozhodnutí a postup přesunu ze
Supabase popisuje `docs/NASAZENI.md`; tenhle soubor jen říká, co kde leží.

| Adresář    | Obsah                                                                          | Kdo pouští                                    |
| ---------- | ------------------------------------------------------------------------------ | --------------------------------------------- |
| `migrace/` | schéma po vrstvách, číslované `0001_…`; soubory s `_` na začátku jsou šablony  | `npm run mssql:migrace` jako `udrzba_migrace` |
| `seed/`    | testovací data, idempotentní SQL v pořadí názvu                                | `npm run mssql:seed`                          |
| `testy/`   | T-SQL testy; neúspěch = `THROW 60000`, průběh `PRINT`                          | `npm run mssql:testy`                         |
| `agent/`   | úloha SQL Server Agenta (noční plánovač); aplikuje IT jednou, potřebuje `msdb` | ručně                                         |

Aplikované migrace si databáze pamatuje v `dbo._migrace` i s otiskem obsahu — už
aplikovaný soubor se nemění, změna patří do nové migrace.

## Zprovoznění nad lokálním serverem

```bash
npm run mssql:init      # databáze + loginy, jen lokálně pod správcem serveru
npm run mssql:migrace   # schéma
npm run mssql:seed      # data
npm run mssql:testy     # ověření
```

Nad databází od IT se `mssql:init` nepouští; co má IT založit, vypíše
`npm run mssql:init -- --jen-vypis`.

## Pravidla pro migrace

- Jeden soubor = jedna transakce. `ALTER DATABASE` a jiné příkazy, které v transakci
  nesmí být, patří do `scripts/mssql-init.mjs`.
- Dávky se dělí na řádcích `GO`; `CREATE PROCEDURE`, `CREATE FUNCTION`, `CREATE VIEW`
  a `CREATE TRIGGER` musí být v dávce první.
- Bezpečnostní politiky mají `SCHEMABINDING`: migrace, která mění sloupec použitý
  v predikátu, musí politiku shodit a znovu postavit (šablona
  `migrace/_sablona_zmena_sloupce.sql`).
- Po `ALTER TABLE` se znovu vygeneruje auditní trigger té tabulky
  (`exec dbo.vytvor_auditni_trigger`).
