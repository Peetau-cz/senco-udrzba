/**
 * Smaže VŠECHNY objekty v databázi a nahraje migrace a seed znovu.
 *
 *   npm run mssql:reset
 *
 * Mimo localhost odmítne běžet, dokud .env.local neříká MSSQL_POVOLIT_RESET=ano.
 * Nikdy ho nepouštějte proti ostré databázi - je to totéž co `supabase db reset`.
 */

import { aplikujMigrace } from './lib/migrace.mjs'
import { jeLokalniServer, nazevDatabaze, popisChyby, pripoj } from './lib/mssql.mjs'
import { smazVsechnyObjekty } from './lib/obnova.mjs'
import { nahrajSeedSql } from './lib/seed.mjs'

async function main() {
  const server = process.env.MSSQL_SERVER ?? ''
  if (!jeLokalniServer(server) && process.env.MSSQL_POVOLIT_RESET !== 'ano') {
    throw new Error(
      `Server ${server} není localhost. Reset maže všechna data; mimo tento počítač ` +
        'běží jen s MSSQL_POVOLIT_RESET=ano v .env.local.',
    )
  }

  const pool = await pripoj('migrace')
  try {
    console.log(`Reset ${process.env.MSSQL_SERVER} / ${nazevDatabaze()}`)
    await smazVsechnyObjekty(pool)
    console.log('- objekty smazány')
    await aplikujMigrace(pool)
    await nahrajSeedSql(pool)
    console.log('\nHotovo.')
  } finally {
    await pool.close()
  }
}

main().catch((chyba) => {
  console.error(popisChyby(chyba))
  process.exit(1)
})
