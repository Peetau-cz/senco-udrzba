/**
 * Založení databáze a účtů na LOKÁLNÍM SQL Serveru (docs/NASAZENI.md).
 *
 * Běží pod správcem serveru (MSSQL_ADMIN_USER, typicky `sa`) nad `master`.
 * Na serveru od IT se nepouští - IT udělá totéž svými nástroji; co přesně,
 * vypíše `npm run mssql:init -- --jen-vypis`, aniž by se k čemukoli připojil.
 *
 * Co vznikne:
 *   - databáze (MSSQL_DATABASE, výchozí Udrzba) s českou kolací a nastavením,
 *     na kterém stojí schéma (compatibility 150, RECURSIVE_TRIGGERS OFF,
 *     READ_COMMITTED_SNAPSHOT ON);
 *   - login `udrzba_migrace` jako VLASTNÍK databáze (migrace, seed, testy);
 *   - loginy `udrzba_app` a `udrzba_planovac` jen s právem připojit se -
 *     zbytek práv jim dá migrace 0006.
 *
 * Skript je idempotentní: co existuje, přeskočí. Hesla bere z .env.local.
 */

import {
  ChybaNastaveni,
  nazevDatabaze,
  nazevLoginu,
  popisChyby,
  pripoj,
  spustDavku,
} from './lib/mssql.mjs'

const jenVypis = process.argv.includes('--jen-vypis')

function heslo(promenna) {
  const hodnota = process.env[promenna]
  if (!hodnota && !jenVypis) throw new ChybaNastaveni(`Chybí ${promenna} v .env.local.`)
  return hodnota ?? `<${promenna}>`
}

/** Heslo do T-SQL literálu: zdvojit apostrofy. */
const literal = (text) => `N'${text.replace(/'/g, "''")}'`

export function sestavPrikazy() {
  const db = nazevDatabaze()
  const migrace = nazevLoginu('migrace')
  const app = nazevLoginu('app')
  const planovac = nazevLoginu('planovac')

  return [
    {
      popis: `databáze ${db}`,
      text: `if db_id(N'${db}') is null
  create database [${db}] collate Czech_100_CI_AS;`,
    },
    {
      popis: 'nastavení databáze',
      text: `alter database [${db}] set compatibility_level = 150;
alter database [${db}] set recursive_triggers off;
alter database [${db}] set read_committed_snapshot on with rollback immediate;`,
    },
    ...[
      [migrace, 'MSSQL_MIGRACE_PASSWORD'],
      [app, 'MSSQL_APP_PASSWORD'],
      [planovac, 'MSSQL_PLANOVAC_PASSWORD'],
    ].map(([login, promenna]) => ({
      popis: `login ${login}`,
      text: `if suser_id(N'${login}') is null
  create login [${login}] with password = ${literal(heslo(promenna))}, default_database = [${db}], check_policy = off;`,
    })),
    {
      popis: `vlastník databáze = ${migrace}`,
      text: `alter authorization on database::[${db}] to [${migrace}];`,
    },
    ...[app, planovac].map((login) => ({
      popis: `uživatel ${login} v databázi (jen připojení)`,
      text: `use [${db}];
if database_principal_id(N'${login}') is null
  create user [${login}] for login [${login}];`,
    })),
  ]
}

async function main() {
  const prikazy = sestavPrikazy()

  if (jenVypis) {
    console.log('-- Co by npm run mssql:init provedl (hesla doplní IT):\n')
    for (const p of prikazy) console.log(`-- ${p.popis}\n${p.text}\nGO\n`)
    return
  }

  const pool = await pripoj('admin', { databaze: 'master' })
  try {
    for (const p of prikazy) {
      await spustDavku(pool, p.text)
      console.log(`+ ${p.popis}`)
    }
    console.log(`\nHotovo. Dál: npm run mssql:migrace && npm run mssql:seed`)
  } finally {
    await pool.close()
  }
}

main().catch((chyba) => {
  console.error(popisChyby(chyba))
  process.exit(1)
})
