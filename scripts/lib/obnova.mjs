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

/**
 * Smaže v databázi všechny uživatelské objekty (ne loginy, uživatele ani role).
 *
 * Pořadí je dané závislostmi: CHECK omezení a výchozí hodnoty volají funkce
 * (dbo.dnes(), tvarové kontroly JSON), funkce se SCHEMABINDING drží tabulky
 * i jiné funkce a predikáty RLS drží obojí. Proto nejdřív politiky, cizí klíče
 * a omezení, pak pohledy a procedury, funkce opakovaně, dokud nějaká jde
 * smazat (řetězy SCHEMABINDING), a teprve potom tabulky a schémata.
 */
export const SMAZANI_OBJEKTU = `
set xact_abort off;
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

-- 3. CHECK omezení a výchozí hodnoty (volají funkce)
select @sql += N'alter table ' + quotename(s.name) + N'.' + quotename(t.name)
  + N' drop constraint ' + quotename(c.name) + N';' + char(10)
from (select name, parent_object_id from sys.check_constraints
      union all
      select name, parent_object_id from sys.default_constraints) c
  join sys.tables t on t.object_id = c.parent_object_id
  join sys.schemas s on s.schema_id = t.schema_id
where t.is_ms_shipped = 0;

-- 4. pohledy a procedury (triggery zmizí s tabulkami)
select @sql += N'drop ' + case o.type when 'V' then N'view ' else N'procedure ' end
  + quotename(s.name) + N'.' + quotename(o.name) + N';' + char(10)
from sys.objects o join sys.schemas s on s.schema_id = o.schema_id
where o.type in ('V', 'P') and o.is_ms_shipped = 0;

exec sp_executesql @sql;

-- 5. funkce: dokola, dokud se daří (funkce drží jiné funkce přes SCHEMABINDING)
declare @nazev nvarchar(600), @smazano int = 1;
while @smazano > 0 and exists (
  select 1 from sys.objects where type in ('FN', 'IF', 'TF') and is_ms_shipped = 0)
begin
  set @smazano = 0;
  declare funkce cursor local fast_forward for
    select quotename(s.name) + N'.' + quotename(o.name)
    from sys.objects o join sys.schemas s on s.schema_id = o.schema_id
    where o.type in ('FN', 'IF', 'TF') and o.is_ms_shipped = 0;
  open funkce;
  fetch next from funkce into @nazev;
  while @@fetch_status = 0
  begin
    begin try
      exec (N'drop function ' + @nazev + N';');
      set @smazano += 1;
    end try
    begin catch
    end catch;
    fetch next from funkce into @nazev;
  end;
  close funkce;
  deallocate funkce;
end;

-- 6. tabulky
set @sql = N'';
select @sql += N'drop table ' + quotename(s.name) + N'.' + quotename(t.name) + N';' + char(10)
from sys.tables t join sys.schemas s on s.schema_id = t.schema_id
where t.is_ms_shipped = 0;

-- 7. vlastní schémata (bezpecnost apod.)
select @sql += N'drop schema ' + quotename(name) + N';' + char(10)
from sys.schemas
where schema_id between 5 and 16383 and name not in ('guest', 'INFORMATION_SCHEMA', 'sys')
  and principal_id = 1;

exec sp_executesql @sql;

-- Kdyby něco zůstalo (funkce držená tabulkou), dojde k tomu až po tabulkách.
declare @zbyva nvarchar(max) = N'';
select @zbyva += N'drop function ' + quotename(s.name) + N'.' + quotename(o.name) + N';' + char(10)
from sys.objects o join sys.schemas s on s.schema_id = o.schema_id
where o.type in ('FN', 'IF', 'TF') and o.is_ms_shipped = 0;
exec sp_executesql @zbyva;`

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
