/**
 * Naplnění databáze testovacími daty z `mssql/seed/*.sql`.
 *
 * Soubory jsou idempotentní (`where not exists` / `merge`), takže se seed dá
 * pouštět opakovaně. Pořadí dává název souboru. Testovací osoby s hesly
 * zakládá skript `mssql-seed.mjs` až po SQL souborech - hash hesla se počítá
 * v Node (src/lib/auth/heslo.ts), SQL Server scrypt neumí.
 */

import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { rozdelNaDavkyPodrobne } from './davky.mjs'
import { popisChyby, spustDavku } from './mssql.mjs'

export const ADRESAR_SEEDU = path.resolve('mssql', 'seed')

/**
 * @param {import('mssql').ConnectionPool} pool
 * @param {{ log?: (radek: string) => void }} [volby]
 * @returns {Promise<string[]>} názvy spuštěných souborů
 */
export async function nahrajSeedSql(pool, volby = {}) {
  const log = volby.log ?? console.log
  const nazvy = (await readdir(ADRESAR_SEEDU).catch(() => []))
    .filter((n) => n.toLowerCase().endsWith('.sql'))
    .sort()

  for (const nazev of nazvy) {
    const text = await readFile(path.join(ADRESAR_SEEDU, nazev), 'utf8')
    for (const davka of rozdelNaDavkyPodrobne(text)) {
      try {
        await spustDavku(pool, davka.text, (hlaska) => log(`    ${hlaska}`))
      } catch (chyba) {
        throw new Error(`${nazev}: ${popisChyby(chyba, davka.radek)}`)
      }
    }
    log(`+ seed ${nazev}`)
  }

  return nazvy
}
