/**
 * Aplikuje migrace z mssql/migrace/ (docs/NASAZENI.md).
 *
 *   npm run mssql:migrace              aplikuje, co chybí
 *   npm run mssql:migrace -- --kontrola  jen vypíše stav, nic nemění
 *
 * Běží jako vlastník databáze (MSSQL_MIGRACE_USER). Podrobnosti v lib/migrace.mjs.
 */

import { aplikujMigrace } from './lib/migrace.mjs'
import { nazevDatabaze, popisChyby, pripoj } from './lib/mssql.mjs'

async function main() {
  const jenKontrola = process.argv.includes('--kontrola')
  const pool = await pripoj('migrace')
  try {
    console.log(
      `Migrace nad ${process.env.MSSQL_SERVER} / ${nazevDatabaze()}${jenKontrola ? ' (jen kontrola)' : ''}`,
    )
    const v = await aplikujMigrace(pool, { jenKontrola })
    console.log(
      `\n${jenKontrola ? 'Čeká' : 'Aplikováno'}: ${v.aplikovane.length}, už hotových: ${v.preskocene.length}`,
    )
  } finally {
    await pool.close()
  }
}

main().catch((chyba) => {
  console.error(popisChyby(chyba))
  process.exit(1)
})
