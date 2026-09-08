/**
 * Spouští T-SQL testy z mssql/testy/*.sql (docs/NASAZENI.md).
 *
 *   npm run mssql:testy                 všechny
 *   npm run mssql:testy -- rls osoby    jen soubory, jejichž název obsahuje slovo
 *   npm run mssql:testy -- --bez-obnovy neobnovovat databázi mezi soubory (rychlé
 *                                       ladění jednoho testu; stav zůstane špinavý)
 *
 * Testy běží jako vlastník databáze bez vnější transakce: chyba v triggeru
 * v SQL Serveru vrátí celou transakci, takže se očekávané chyby chytají přes
 * TRY/CATCH a fixtury se opravdu zapíšou. Po každém souboru se proto databáze
 * vrací do výchozího stavu - snímkem, nebo smazáním objektů a novou migrací.
 *
 * Úmluva pro testy: neúspěch = `THROW 60000, N'…', 1`; průběh se hlásí
 * `PRINT`. Práva se ověřují pod `EXECUTE AS USER = 'udrzba_app'` … `REVERT`.
 */

import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { rozdelNaDavkyPodrobne } from './lib/davky.mjs'
import { aplikujMigrace } from './lib/migrace.mjs'
import { nazevDatabaze, popisChyby, pripoj, spustDavku } from './lib/mssql.mjs'
import {
  obnovZeSnimku,
  pripojMaster,
  smazSnimek,
  smazVsechnyObjekty,
  vytvorSnimek,
} from './lib/obnova.mjs'
import { nahrajSeedSql } from './lib/seed.mjs'

const ADRESAR_TESTU = path.resolve('mssql', 'testy')

async function vyberSoubory(filtry) {
  const vsechny = (await readdir(ADRESAR_TESTU).catch(() => []))
    .filter((n) => n.toLowerCase().endsWith('.sql'))
    .sort()
  if (filtry.length === 0) return vsechny
  return vsechny.filter((n) => filtry.some((f) => n.toLowerCase().includes(f.toLowerCase())))
}

/** Spustí jeden soubor; vrací null při úspěchu, jinak popis chyby. */
async function spustTest(nazev) {
  const text = await readFile(path.join(ADRESAR_TESTU, nazev), 'utf8')
  const pool = await pripoj('migrace')
  try {
    for (const davka of rozdelNaDavkyPodrobne(text)) {
      await spustDavku(pool, davka.text, (hlaska) => console.log(`    ${hlaska}`))
    }
    return null
  } catch (chyba) {
    return popisChyby(chyba)
  } finally {
    await pool.close()
  }
}

async function main() {
  const argumenty = process.argv.slice(2)
  const bezObnovy = argumenty.includes('--bez-obnovy')
  const soubory = await vyberSoubory(argumenty.filter((a) => !a.startsWith('--')))

  if (soubory.length === 0) {
    console.log('Žádné testy k spuštění (mssql/testy/*.sql).')
    return
  }

  console.log(
    `Testy nad ${process.env.MSSQL_SERVER} / ${nazevDatabaze()}: ${soubory.length} souborů\n`,
  )

  const master = bezObnovy ? null : await pripojMaster()
  const snimek = master ? await vytvorSnimek(master) : false
  const neuspechy = []

  try {
    for (const nazev of soubory) {
      console.log(`▶ ${nazev}`)
      const chyba = await spustTest(nazev)
      if (chyba) {
        neuspechy.push(nazev)
        console.log(`  ✖ ${chyba}\n`)
      } else {
        console.log(`  ✔ prošel\n`)
      }

      if (bezObnovy) continue
      if (snimek) {
        await obnovZeSnimku(master)
      } else {
        const pool = await pripoj('migrace')
        try {
          await smazVsechnyObjekty(pool)
          await aplikujMigrace(pool, { log: () => {} })
          await nahrajSeedSql(pool, { log: () => {} })
        } finally {
          await pool.close()
        }
      }
    }
  } finally {
    if (master) {
      if (snimek) await smazSnimek(master).catch(() => {})
      await master.close()
    }
  }

  console.log(`Prošlo ${soubory.length - neuspechy.length} z ${soubory.length}.`)
  if (neuspechy.length) {
    console.log(`Neprošly: ${neuspechy.join(', ')}`)
    process.exit(1)
  }
}

main().catch((chyba) => {
  console.error(popisChyby(chyba))
  process.exit(1)
})
