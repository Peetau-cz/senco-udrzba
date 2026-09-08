/**
 * Vrácení databáze do známého stavu - pro testy a pro `mssql:reset`.
 *
 * Dvě cesty:
 *
 * 1. **Snímek databáze** (`CREATE DATABASE … AS SNAPSHOT`, `RESTORE … FROM
 *    DATABASE_SNAPSHOT`) - rychlé, ale chce právo zakládat databáze na serveru.
 *    Na lokálním Developeru ho správce má, na serveru od IT nejspíš ne.
 * 2. **Smazání všech objektů** v databázi a nové nahrání migrací a seedu -
 *    pomalejší, ale stačí na to vlastník databáze. Nesahá na nic mimo ni.
 *
 * Testy zkusí snímek a když nejde, spadnou na druhou cestu.
 */

import { nazevDatabaze, popisChyby, pripoj, spustDavku } from './mssql.mjs'

/** Smaže v databázi všechny uživatelské objekty (ne loginy, ne uživatele). */
export const SMAZANI_OBJEKTU = `
declare @sql nvarchar(max) = N'';

-- 1. bezpečnostní politiky (drží predikátové funkce i tabulky)
select @sql += N'drop security policy ' + quotename(s.name) + N'.' + quotename(p.name) + N';' + char(10)
from sys.security_policies p join sys.schemas s on s.schema_id = p.schema_id;

-- 2. cizí klíče (jinak by tabulky nešly mazat v libovolném pořadí)
select @sql += N'alter table ' + quotename(s.name) + N'.' + quotename(t.name)
  + N' drop constraint ' + quotename(fk.name) + N';' + char(10)
from sys.foreign_keys fk
  join sys.tables t on t.object_id = fk.parent_object_id
  join sys.schemas s on s.schema_id = t.schema_id;

-- 3. pohledy, procedury, funkce (triggery zmizí s tabulkami)
select @sql += N'drop ' + case o.type
    when 'V' then N'view ' when 'P' then N'procedure ' else N'function ' end
  + quotename(s.name) + N'.' + quotename(o.name) + N';' + char(10)
from sys.objects o join sys.schemas s on s.schema_id = o.schema_id
where o.type in ('V', 'P', 'FN', 'IF', 'TF') and o.is_ms_shipped = 0;

-- 4. tabulky
select @sql += N'drop table ' + quotename(s.name) + N'.' + quotename(t.name) + N';' + char(10)
from sys.tables t join sys.schemas s on s.schema_id = t.schema_id
where t.is_ms_shipped = 0;

-- 5. vlastní schémata (bezpecnost apod.)
select @sql += N'drop schema ' + quotename(name) + N';' + char(10)
from sys.schemas
where schema_id between 5 and 16383 and name not in ('guest', 'INFORMATION_SCHEMA', 'sys')
  and principal_id = 1;

exec sp_executesql @sql;`

export async function smazVsechnyObjekty(pool) {
  await spustDavku(pool, SMAZANI_OBJEKTU)
}

const NAZEV_SNIMKU = () => `${nazevDatabaze()}_snimek`

/**
 * Založí snímek databáze. Vrací true, když se povedlo; false, když server
 * nebo práva snímky nedovolí (chyby 262 = chybí CREATE DATABASE, 1844 = edice).
 */
export async function vytvorSnimek(poolMaster, log = console.log) {
  const databaze = nazevDatabaze()
  const snimek = NAZEV_SNIMKU()
  try {
    const soubory = (
      await poolMaster
        .request()
        .query(
          `select name, physical_name from sys.master_files where database_id = db_id(N'${databaze}') and type = 0`,
        )
    ).recordset

    if (soubory.length === 0) throw new Error(`Databáze ${databaze} nemá datové soubory?`)

    const specifikace = soubory
      .map((s) => {
        const adresar = s.physical_name.replace(/[^\\/]*$/, '')
        return `(name = N'${s.name}', filename = N'${adresar}${snimek}_${s.name}.ss')`
      })
      .join(', ')

    await spustDavku(poolMaster, `if db_id(N'${snimek}') is not null drop database [${snimek}];`)
    await spustDavku(
      poolMaster,
      `create database [${snimek}] on ${specifikace} as snapshot of [${databaze}];`,
    )
    return true
  } catch (chyba) {
    log(`  snímek databáze nejde vytvořit (${popisChyby(chyba)}), obnova půjde přes migrace`)
    return false
  }
}

/** Vrátí databázi do stavu snímku. Všechna ostatní spojení k ní musí být zavřená. */
export async function obnovZeSnimku(poolMaster) {
  const databaze = nazevDatabaze()
  await spustDavku(
    poolMaster,
    `alter database [${databaze}] set single_user with rollback immediate;
     restore database [${databaze}] from database_snapshot = N'${NAZEV_SNIMKU()}';
     alter database [${databaze}] set multi_user;`,
  )
}

export async function smazSnimek(poolMaster) {
  const snimek = NAZEV_SNIMKU()
  await spustDavku(poolMaster, `if db_id(N'${snimek}') is not null drop database [${snimek}];`)
}

/** Připojení k master pod účtem migrací - snímky a obnova musí běžet mimo databázi. */
export function pripojMaster() {
  return pripoj('migrace', { databaze: 'master' })
}
