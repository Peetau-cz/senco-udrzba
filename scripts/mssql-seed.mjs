/**
 * Nahraje testovací data (docs/NASAZENI.md).
 *
 *   npm run mssql:seed
 *
 * Nejdřív SQL soubory z mssql/seed/ (číselníky, umístění, stroje, šablony),
 * potom testovací osoby s hesly - ty zakládá tenhle skript, protože hash hesla
 * počítá Node. Osoby přibudou s migrací schématu (kolo R1 plánu).
 */

import { nazevDatabaze, popisChyby, pripoj } from './lib/mssql.mjs'
import { nahrajSeedSql } from './lib/seed.mjs'

async function main() {
  const pool = await pripoj('migrace')
  try {
    console.log(`Seed nad ${process.env.MSSQL_SERVER} / ${nazevDatabaze()}`)
    const soubory = await nahrajSeedSql(pool)
    console.log(`\nHotovo: ${soubory.length} souborů.`)
  } finally {
    await pool.close()
  }
}

main().catch((chyba) => {
  console.error(popisChyby(chyba))
  process.exit(1)
})
