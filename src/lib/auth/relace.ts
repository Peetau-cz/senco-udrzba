/**
 * Relace přihlášeného uživatele v podepsané cookie (docs/NASAZENI.md).
 *
 * Bez stavu na serveru: cookie nese id osoby, čas vydání a konec platnosti,
 * a podpis HMAC-SHA256 tajemstvím ze serveru. Kdo tajemství nezná, hodnotu
 * nezmění ani si nevyrobí vlastní. Zneplatnění dřív, než vyprší: `session.ts`
 * po ověření podpisu kontroluje `profil.aktivni` a `profil.relace_platne_od`
 * (změna hesla, vyřazení osoby) - cookie sama je jen vstupenka.
 *
 * Tajemství je stejně citlivé jako dřív servisní klíč: kdo ho drží, vydá si
 * libovolnou identitu. Patří výhradně na server (`RELACE_TAJEMSTVI`).
 *
 * Soubor je bez závislostí na Next i databázi, aby šel testovat samostatně
 * a používat z proxy i ze serverových akcí.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'

export const NAZEV_COOKIE = 'udrzba_relace'
export const MIN_DELKA_TAJEMSTVI = 32

export type Relace = {
  /** Id osoby (`profil.id`) - do sloupců typu `dokoncil_id` patří tohle. */
  osobaId: string
  /** ISO čas vydání; porovnává se s `profil.relace_platne_od`. */
  vydano: string
  /** ISO konec platnosti. */
  platiDo: string
}

/** Co se opravdu ukládá do cookie - krátké klíče, časy v milisekundách. */
type Obsah = { o: string; v: number; e: number }

const TVAR_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function overTajemstvi(tajemstvi: string) {
  if (tajemstvi.length < MIN_DELKA_TAJEMSTVI) {
    throw new Error(`RELACE_TAJEMSTVI musí mít aspoň ${MIN_DELKA_TAJEMSTVI} znaků.`)
  }
}

function podepis(obsah: string, tajemstvi: string): string {
  return createHmac('sha256', tajemstvi).update(obsah).digest('base64url')
}

export function vytvorRelaci(
  volby: { osobaId: string; ted?: Date; platnostH: number },
  tajemstvi: string,
): string {
  overTajemstvi(tajemstvi)
  const ted = volby.ted ?? new Date()
  const obsah: Obsah = {
    o: volby.osobaId.toLowerCase(),
    v: ted.getTime(),
    e: ted.getTime() + volby.platnostH * 60 * 60 * 1000,
  }
  const zakodovany = Buffer.from(JSON.stringify(obsah), 'utf8').toString('base64url')
  return `${zakodovany}.${podepis(zakodovany, tajemstvi)}`
}

/**
 * Ověří podpis a platnost. Cokoli podezřelého znamená „nepřihlášen", ne
 * výjimku - proxy nemá komu co vysvětlovat.
 */
export function overRelaci(hodnota: string, tajemstvi: string, ted = new Date()): Relace | null {
  const casti = hodnota.split('.')
  if (casti.length !== 2) return null
  const [zakodovany, podpis_] = casti as [string, string]
  if (!zakodovany || !podpis_) return null

  const ocekavany = Buffer.from(podepis(zakodovany, tajemstvi), 'utf8')
  const dodany = Buffer.from(podpis_, 'utf8')
  if (ocekavany.length !== dodany.length || !timingSafeEqual(ocekavany, dodany)) return null

  let obsah: unknown
  try {
    obsah = JSON.parse(Buffer.from(zakodovany, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  if (!jeObsah(obsah)) return null
  if (obsah.e <= ted.getTime()) return null

  return {
    osobaId: obsah.o,
    vydano: new Date(obsah.v).toISOString(),
    platiDo: new Date(obsah.e).toISOString(),
  }
}

function jeObsah(x: unknown): x is Obsah {
  if (typeof x !== 'object' || x === null) return false
  const o = x as Record<string, unknown>
  return (
    typeof o.o === 'string' &&
    TVAR_ID.test(o.o) &&
    typeof o.v === 'number' &&
    Number.isFinite(o.v) &&
    typeof o.e === 'number' &&
    Number.isFinite(o.e) &&
    o.e > o.v
  )
}

/**
 * Prodlužovat se má, až uplyne půlka platnosti: aktivní uživatel se pak
 * nikdy neodhlásí uprostřed práce, a přitom se cookie nepřepisuje při
 * každém požadavku.
 */
export function jeCasProdlouzit(relace: Relace, ted = new Date()): boolean {
  const vydano = new Date(relace.vydano).getTime()
  const platiDo = new Date(relace.platiDo).getTime()
  return ted.getTime() - vydano > (platiDo - vydano) / 2
}

/**
 * Nastavení cookie pro `cookies().set(...)` v Next.
 *
 * `Secure` jen v produkci - lokální vývoj běží po HTTP a prohlížeč by cookie
 * zahodil. `SameSite=Lax` stačí: formuláře posílá aplikace sama sobě a
 * odkaz z mailu na stránku (GET) přihlášení zachová.
 */
export function moznostiCookie(platiDo: Date, volby: { produkce: boolean }) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    secure: volby.produkce,
    expires: platiDo,
  }
}
