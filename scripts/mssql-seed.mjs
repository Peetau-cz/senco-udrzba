/**
 * Nahraje testovací data (docs/NASAZENI.md).
 *
 *   npm run mssql:seed
 *
 * Nejdřív SQL soubory z mssql/seed/ (číselníky, umístění, stroje, šablony),
 * potom testovací osoby s rolemi, oblastmi, hesly a PINy (SEED_PIN, výchozí 2580)
 * (scripts/lib/osoby-seed.mjs). Heslo pro všechny je SEED_HESLO,
 * výchozí Senco.Test123. NIKDY nespouštět proti ostré databázi.
 */

import { nazevDatabaze, popisChyby, pripoj } from './lib/mssql.mjs'
import { nahrajOsoby } from './lib/osoby-seed.mjs'
import { nahrajSeedSql } from './lib/seed.mjs'

async function main() {
  const heslo = process.env.SEED_HESLO ?? 'Senco.Test123'
  const pool = await pripoj('migrace')
  try {
    console.log(`Seed nad ${process.env.MSSQL_SERVER} / ${nazevDatabaze()}\n`)
    const soubory = await nahrajSeedSql(pool)
    console.log()
    await nahrajOsoby(pool, { heslo })
    console.log(`\nHotovo: ${soubory.length} souborů SQL a testovací osoby. Heslo účtů: ${heslo}`)
  } finally {
    await pool.close()
  }
}

main().catch((chyba) => {
  console.error(popisChyby(chyba))
  process.exit(1)
})
