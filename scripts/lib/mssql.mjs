/**
 * Připojení skriptů k SQL Serveru (docs/NASAZENI.md).
 *
 * Údaje se berou z `.env.local` (skripty se pouštějí s `--env-file`). Každý
 * skript se hlásí pod účtem, který má právě na svou práci: migrace, seed
 * a testy jako `udrzba_migrace` (vlastník databáze), založení databáze jako
 * správce serveru, plánovač jako `udrzba_planovac`. Aplikační účet
 * `udrzba_app` skripty nepoužívají - ten patří aplikaci (src/lib/env.ts).
 */

import sql from 'mssql'

const UCTY = {
  admin: ['MSSQL_ADMIN_USER', 'MSSQL_ADMIN_PASSWORD'],
  migrace: ['MSSQL_MIGRACE_USER', 'MSSQL_MIGRACE_PASSWORD'],
  app: ['MSSQL_APP_USER', 'MSSQL_APP_PASSWORD'],
  planovac: ['MSSQL_PLANOVAC_USER', 'MSSQL_PLANOVAC_PASSWORD'],
}

/** Výchozí názvy loginů; IT může dodat jiné, pak se nastaví v .env.local. */
export const VYCHOZI_LOGINY = {
  migrace: 'udrzba_migrace',
  app: 'udrzba_app',
  planovac: 'udrzba_planovac',
}

export class ChybaNastaveni extends Error {}

function povinna(nazev) {
  const hodnota = process.env[nazev]
  if (!hodnota) {
    throw new ChybaNastaveni(
      `Chybí ${nazev} v .env.local (vzor je v .env.example). Do chatu ani do gitu nepatří.`,
    )
  }
  return hodnota
}

export function nazevDatabaze() {
  return process.env.MSSQL_DATABASE || 'Udrzba'
}

/** Login pro danou roli - z env, nebo výchozí název. */
export function nazevLoginu(role) {
  const [promennaUzivatele] = UCTY[role]
  return process.env[promennaUzivatele] || VYCHOZI_LOGINY[role]
}

/**
 * Sestaví nastavení pro balíček mssql.
 *
 * @param {'admin'|'migrace'|'app'|'planovac'} role
 * @param {{ databaze?: string }} [volby] - výchozí je MSSQL_DATABASE (Udrzba);
 *   správcovské úkony běží nad `master`
 */
export function nactiNastaveni(role, volby = {}) {
  const [promennaUzivatele, promennaHesla] = UCTY[role]
  const server = povinna('MSSQL_SERVER')
  const uzivatel = role === 'admin' ? povinna(promennaUzivatele) : nazevLoginu(role)
  const heslo = povinna(promennaHesla)

  const instance = process.env.MSSQL_INSTANCE || undefined
  const port = process.env.MSSQL_PORT ? Number(process.env.MSSQL_PORT) : undefined
  if (instance && port) {
    throw new ChybaNastaveni('MSSQL_INSTANCE a MSSQL_PORT se vylučují - nastavte jen jedno.')
  }

  return {
    server,
    port: instance ? undefined : (port ?? 1433),
    database: volby.databaze ?? nazevDatabaze(),
    user: uzivatel,
    password: heslo,
    options: {
      encrypt: true,
      // 'ne' = ověřovat certifikát serveru (ostrý provoz s certifikátem od IT).
      // Cokoli jiného = věřit i vlastnoručně podepsanému (lokální vývoj).
      trustServerCertificate: (process.env.MSSQL_TRUST_CERT ?? 'ano') !== 'ne',
      instanceName: instance,
      useUTC: true,
      abortTransactionOnError: true,
    },
    connectionTimeout: 15_000,
    requestTimeout: 120_000,
    pool: { min: 0, max: 2 },
  }
}

/**
 * Otevře pool. Volající ho po práci zavře (`await pool.close()`), jinak proces
 * neskončí.
 */
export async function pripoj(role, volby) {
  const nastaveni = nactiNastaveni(role, volby)
  const pool = new sql.ConnectionPool(nastaveni)
  await pool.connect()
  return pool
}

/** Je server na tomhle počítači? Rozhoduje, jestli se smí mazat bez potvrzení. */
export function jeLokalniServer(server = process.env.MSSQL_SERVER ?? '') {
  const hostitel = server.split('\\')[0].split(',')[0].trim().toLowerCase()
  return ['localhost', '127.0.0.1', '::1', '.', '(local)', 'localhost.'].includes(hostitel)
}

/**
 * Spustí jednu dávku. Hlášky z `PRINT` a `RAISERROR ... WITH NOWAIT` vypíše
 * přes `naHlasku`, aby testy mohly říkat, co zrovna kontrolují.
 *
 * @param {sql.ConnectionPool | sql.Transaction} spojeni
 * @param {string} text
 * @param {(hlaska: string) => void} [naHlasku]
 */
export async function spustDavku(spojeni, text, naHlasku) {
  const pozadavek = new sql.Request(spojeni)
  if (naHlasku) pozadavek.on('info', (info) => naHlasku(info.message))
  return pozadavek.batch(text)
}

/**
 * Chyba SQL Serveru do jednoho řádku: číslo, řádek v dávce, procedura, text.
 * `posunRadku` je řádek, na kterém dávka ve zdrojovém souboru začíná - číslo
 * v chybě je totiž relativní k dávce, ne k souboru.
 */
export function popisChyby(chyba, posunRadku = 0) {
  if (chyba instanceof ChybaNastaveni) return chyba.message
  const casti = []
  if (chyba.number) casti.push(`chyba ${chyba.number}`)
  if (chyba.lineNumber) {
    const radek = posunRadku ? posunRadku + chyba.lineNumber - 1 : chyba.lineNumber
    casti.push(`řádek ${radek}`)
  }
  if (chyba.procName) casti.push(`v ${chyba.procName}`)
  const hlavicka = casti.length ? `[${casti.join(', ')}] ` : ''
  return `${hlavicka}${chyba.message ?? String(chyba)}`
}

export { sql }
