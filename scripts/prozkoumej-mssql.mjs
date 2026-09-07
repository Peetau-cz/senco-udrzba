/**
 * Průzkum SQL Serveru před přesunem (docs/NASAZENI.md, 7. 9. 2026).
 *
 * Skript JEN ČTE. Vypíše verzi a edici serveru, jestli běží SQL Server Agent,
 * seznam databází a u vybraných databází tabulky, které podle názvu vypadají
 * jako uživatelé, zaměstnanci, karty nebo práva - i s jejich sloupci. Podle
 * toho se rozhodne, jak se napojí přihlášení ze ZAKMATu a odkud přijdou osoby.
 *
 * Co skript NIKDY nedělá: nečte řádky uživatelských tabulek (jen jejich počet),
 * nevypisuje hesla ani jiné hodnoty, nic nezapisuje. Přístupové údaje bere
 * z .env.local, které je mimo git.
 *
 * Spuštění:  npm run mssql:prozkoumej
 *            npm run mssql:prozkoumej -- --databaze=ZAKMAT,Personalistika
 *            npm run mssql:prozkoumej -- --vzor=uziv,zamest,osob,karta,prav,role,login
 * Vyžaduje:  .env.local s MSSQL_SERVER, MSSQL_USER, MSSQL_PASSWORD
 *            (volitelně MSSQL_DATABASE, MSSQL_PORT, MSSQL_INSTANCE, MSSQL_DOMAIN)
 */

import sql from 'mssql'

// --- Nastavení -----------------------------------------------------------------

const argumenty = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const [klic, ...zbytek] = a.slice(2).split('=')
      return [klic, zbytek.join('=')]
    }),
)

const server = process.env.MSSQL_SERVER
const uzivatel = process.env.MSSQL_USER
const heslo = process.env.MSSQL_PASSWORD

if (!server || !uzivatel || !heslo) {
  console.error(
    'Chybí MSSQL_SERVER, MSSQL_USER nebo MSSQL_PASSWORD.\n' +
      'Doplňte je do .env.local (vzor je v .env.example). Do chatu ani do gitu nepatří.',
  )
  process.exit(1)
}

// Výchozí vzory pokrývají české i anglické názvy, na které se v ZAKMATu dá narazit.
const VYCHOZI_VZORY = [
  'uziv',
  'user',
  'login',
  'zamest',
  'osob',
  'prac',
  'karta',
  'prav',
  'role',
  'opravn',
]
const vzory = (argumenty.vzor ? argumenty.vzor.split(',') : VYCHOZI_VZORY)
  .map((v) => v.trim().toLowerCase())
  .filter(Boolean)

// Které databáze prohlédnout: argument, nebo MSSQL_DATABASE, nebo všechny přístupné.
const vybraneDatabaze = argumenty.databaze
  ? argumenty.databaze
      .split(',')
      .map((d) => d.trim())
      .filter(Boolean)
  : process.env.MSSQL_DATABASE
    ? [process.env.MSSQL_DATABASE]
    : null

const konfigurace = {
  server,
  port: process.env.MSSQL_PORT ? Number(process.env.MSSQL_PORT) : undefined,
  database: process.env.MSSQL_DATABASE || 'master',
  // Doménový účet: MSSQL_DOMAIN=FIRMA přepne na NTLM. Bez něj SQL přihlášení.
  ...(process.env.MSSQL_DOMAIN
    ? {
        authentication: {
          type: 'ntlm',
          options: { domain: process.env.MSSQL_DOMAIN, userName: uzivatel, password: heslo },
        },
      }
    : { user: uzivatel, password: heslo }),
  options: {
    // Firemní server mívá vlastní certifikát; šifrování zůstává zapnuté.
    encrypt: true,
    trustServerCertificate: true,
    instanceName: process.env.MSSQL_INSTANCE || undefined,
    // Čteme jen metadata, dlouhé dotazy tu nejsou - ať se skript nezasekne.
    requestTimeout: 30_000,
  },
  connectionTimeout: 15_000,
}

// --- Pomocné ----------------------------------------------------------------------

function nadpis(text) {
  console.log(`\n=== ${text} ===`)
}

/** Dotaz, jehož selhání není chyba - typicky chybějící právo VIEW SERVER STATE. */
async function zkus(pool, dotaz, coKdyzNe) {
  try {
    const { recordset } = await pool.request().query(dotaz)
    return recordset
  } catch (chyba) {
    console.log(`  (${coKdyzNe}: ${chyba.message.split('\n')[0]})`)
    return null
  }
}

/** Název databáze do třídílného jména - hranaté závorky proti mezerám a pomlčkám. */
function hranate(nazev) {
  return `[${nazev.replace(/]/g, ']]')}]`
}

function vypisTabulku(radky, sloupce) {
  if (!radky || radky.length === 0) {
    console.log('  (nic)')
    return
  }
  const sirky = sloupce.map((s) =>
    Math.max(s.length, ...radky.map((r) => String(r[s] ?? '').length)),
  )
  console.log('  ' + sloupce.map((s, i) => s.padEnd(sirky[i])).join('  '))
  console.log('  ' + sirky.map((w) => '-'.repeat(w)).join('  '))
  for (const r of radky) {
    console.log('  ' + sloupce.map((s, i) => String(r[s] ?? '').padEnd(sirky[i])).join('  '))
  }
}

// --- Průzkum ----------------------------------------------------------------------

let pool
try {
  pool = await sql.connect(konfigurace)
} catch (chyba) {
  console.error(`Připojení k ${server} selhalo: ${chyba.message}`)
  console.error(
    'Zkontrolujte název serveru (u pojmenované instance MSSQL_INSTANCE), port, firewall\n' +
      'a jestli má SQL Server povolené připojení přes TCP/IP.',
  )
  process.exit(1)
}

try {
  nadpis('Server')
  const [verze] = await pool
    .request()
    .query(
      `
    select
      @@version                                  as verze,
      cast(serverproperty('Edition')       as nvarchar(200)) as edice,
      cast(serverproperty('ProductVersion') as nvarchar(50))  as produkt,
      cast(serverproperty('MachineName')   as nvarchar(200)) as stroj,
      cast(serverproperty('InstanceName')  as nvarchar(200)) as instance,
      cast(serverproperty('Collation')     as nvarchar(200)) as collation,
      suser_sname()                              as prihlasen
  `,
    )
    .then((v) => v.recordset)
  console.log(`  ${verze.verze.split('\n')[0].trim()}`)
  console.log(`  edice:      ${verze.edice}`)
  console.log(`  verze:      ${verze.produkt}`)
  console.log(`  stroj:      ${verze.stroj}${verze.instance ? `\\${verze.instance}` : ''}`)
  console.log(`  collation:  ${verze.collation}`)
  console.log(`  přihlášen:  ${verze.prihlasen}`)

  const hlavniVerze = Number(String(verze.produkt).split('.')[0])
  if (hlavniVerze < 13) {
    console.log('  ! Verze starší než 2016: chybí Row-Level Security i JSON. To mění plán.')
  }
  if (/express/i.test(verze.edice)) {
    console.log(
      '  ! Edice Express: bez SQL Server Agenta - noční plánovač poběží z Task Scheduleru.',
    )
  }

  nadpis('SQL Server Agent')
  const sluzby = await zkus(
    pool,
    `select servicename, status_desc, startup_type_desc from sys.dm_server_services`,
    'stav služeb nejde přečíst, chybí právo VIEW SERVER STATE - zeptat se IT',
  )
  if (sluzby) vypisTabulku(sluzby, ['servicename', 'status_desc', 'startup_type_desc'])

  nadpis('Práva přihlášeného účtu na serveru')
  const prava = await zkus(
    pool,
    `select permission_name from fn_my_permissions(null, 'SERVER') order by permission_name`,
    'práva nejde přečíst',
  )
  if (prava) console.log('  ' + prava.map((p) => p.permission_name).join(', '))

  nadpis('Databáze')
  const databaze = await pool
    .request()
    .query(
      `
    select name, state_desc, recovery_model_desc, compatibility_level,
           has_dbaccess(name) as pristup
    from sys.databases
    where database_id > 4
    order by name
  `,
    )
    .then((v) => v.recordset)
  vypisTabulku(
    databaze.map((d) => ({ ...d, pristup: d.pristup ? 'ano' : 'ne' })),
    ['name', 'state_desc', 'recovery_model_desc', 'compatibility_level', 'pristup'],
  )

  const kProhlednuti = (
    vybraneDatabaze ?? databaze.filter((d) => d.pristup).map((d) => d.name)
  ).filter((n) => databaze.some((d) => d.name === n && d.pristup))
  if (vybraneDatabaze) {
    for (const n of vybraneDatabaze) {
      if (!kProhlednuti.includes(n))
        console.log(`  ! Databáze ${n} není přístupná nebo neexistuje.`)
    }
  }

  for (const db of kProhlednuti) {
    nadpis(`Databáze ${db} - tabulky odpovídající vzorům (${vzory.join(', ')})`)

    const podminka = vzory.map((_, i) => `lower(t.name) like '%' + @v${i} + '%'`).join(' or ')
    const pozadavek = pool.request()
    vzory.forEach((v, i) => pozadavek.input(`v${i}`, sql.NVarChar, v))

    const tabulky = await pozadavek
      .query(
        `
        select s.name as schema_name, t.name as table_name,
               (select sum(p.rows) from ${hranate(db)}.sys.partitions p
                 where p.object_id = t.object_id and p.index_id in (0, 1)) as radku
        from ${hranate(db)}.sys.tables t
        join ${hranate(db)}.sys.schemas s on s.schema_id = t.schema_id
        where ${podminka}
        order by s.name, t.name
      `,
      )
      .then((v) => v.recordset)
      .catch((chyba) => {
        console.log(`  (tabulky nejdou přečíst: ${chyba.message.split('\n')[0]})`)
        return []
      })

    vypisTabulku(tabulky, ['schema_name', 'table_name', 'radku'])

    for (const t of tabulky) {
      console.log(`\n  -- ${db}.${t.schema_name}.${t.table_name}`)
      const sloupce = await pool
        .request()
        .input('schema', sql.NVarChar, t.schema_name)
        .input('tabulka', sql.NVarChar, t.table_name)
        .query(
          `
          select c.COLUMN_NAME as sloupec,
                 c.DATA_TYPE
                   + case when c.CHARACTER_MAXIMUM_LENGTH is not null
                          then '(' + cast(c.CHARACTER_MAXIMUM_LENGTH as varchar) + ')' else '' end as typ,
                 c.IS_NULLABLE as null_,
                 isnull(c.COLUMN_DEFAULT, '') as vychozi,
                 isnull((
                   select string_agg(tc.CONSTRAINT_TYPE, ',')
                   from ${hranate(db)}.INFORMATION_SCHEMA.KEY_COLUMN_USAGE k
                   join ${hranate(db)}.INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
                     on tc.CONSTRAINT_NAME = k.CONSTRAINT_NAME and tc.TABLE_SCHEMA = k.TABLE_SCHEMA
                   where k.TABLE_SCHEMA = c.TABLE_SCHEMA and k.TABLE_NAME = c.TABLE_NAME
                     and k.COLUMN_NAME = c.COLUMN_NAME
                 ), '') as klic
          from ${hranate(db)}.INFORMATION_SCHEMA.COLUMNS c
          where c.TABLE_SCHEMA = @schema and c.TABLE_NAME = @tabulka
          order by c.ORDINAL_POSITION
        `,
        )
        .then((v) => v.recordset)
        .catch(async (chyba) => {
          // string_agg je až od SQL 2017 - starší server dostane výpis bez klíčů.
          if (!/string_agg/i.test(chyba.message)) {
            console.log(`  (sloupce nejdou přečíst: ${chyba.message.split('\n')[0]})`)
            return []
          }
          return pool
            .request()
            .input('schema', sql.NVarChar, t.schema_name)
            .input('tabulka', sql.NVarChar, t.table_name)
            .query(
              `
              select COLUMN_NAME as sloupec,
                     DATA_TYPE
                       + case when CHARACTER_MAXIMUM_LENGTH is not null
                              then '(' + cast(CHARACTER_MAXIMUM_LENGTH as varchar) + ')' else '' end as typ,
                     IS_NULLABLE as null_,
                     isnull(COLUMN_DEFAULT, '') as vychozi,
                     '' as klic
              from ${hranate(db)}.INFORMATION_SCHEMA.COLUMNS
              where TABLE_SCHEMA = @schema and TABLE_NAME = @tabulka
              order by ORDINAL_POSITION
            `,
            )
            .then((v) => v.recordset)
        })

      vypisTabulku(sloupce, ['sloupec', 'typ', 'null_', 'vychozi', 'klic'])

      // Sloupec, který vypadá jako heslo, je to nejdůležitější zjištění dne:
      // podle jeho typu a délky se pozná, jestli ZAKMAT ukládá hash, nebo prostý text.
      const heslove = sloupce.filter((c) => /hes|pass|pwd|hash/i.test(c.sloupec))
      if (heslove.length > 0) {
        console.log(
          `  ! Sloupec s heslem: ${heslove.map((c) => `${c.sloupec} ${c.typ}`).join(', ')} - ` +
            'ověřit v Delphi kódu ZAKMATu, jak se heslo porovnává. Hodnoty skript nečte.',
        )
      }
    }
  }

  nadpis('Hotovo')
  console.log(
    '  Výpis obsahuje jen strukturu. Co z něj plyne pro přihlášení a osoby, patří do docs/NASAZENI.md.',
  )
} finally {
  await pool.close()
}
