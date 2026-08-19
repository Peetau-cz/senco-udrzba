/**
 * Termíny plánu údržby: jak daleko je termín a jak se to řekne česky.
 *
 * Bez závislosti na Reactu a Supabase, aby šel soubor testovat samostatně
 * (terminy.test.ts).
 *
 * Datum bez času schválně jako text `YYYY-MM-DD`, ne jako `Date`. Sloupec
 * `plan_udrzby.dalsi_termin` je `date`, tedy den bez pásma - jakmile se z něj
 * udělá `Date`, vznikne půlnoc v UTC a technik v Příbrami by v zimě viděl
 * o den dřív. Počítá se proto nad texty a rozdíl se dělá přes UTC půlnoci,
 * kde letní čas nemůže nic posunout.
 */

import { jednotkaIntervalu } from '@/lib/sablony/interval'

const PASMO = 'Europe/Prague'

/** Dnešek v Příbrami jako `YYYY-MM-DD`. Formát `sv-SE` je shodou okolností ISO. */
export function dnesVPraze(ted: Date = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: PASMO }).format(ted)
}

/** Kolik dnů dělí dva dny zapsané jako `YYYY-MM-DD`. Kladné = `b` je později. */
export function rozdilDnu(a: string, b: string): number {
  return Math.round((naPulnocUTC(b) - naPulnocUTC(a)) / 86_400_000)
}

function naPulnocUTC(den: string): number {
  const [rok = 0, mesic = 1, dennisla = 1] = den.split('-').map(Number)
  return Date.UTC(rok, mesic - 1, dennisla)
}

/**
 * O kolik dnů je termín po termínu. Kladné číslo = zpoždění, záporné = zbývá.
 * Null u řádku, kterému garant termín ještě nezadal.
 */
export function zpozdeniDnu(termin: string | null, dnes: string): number | null {
  if (!termin) return null
  return rozdilDnu(termin, dnes)
}

export type StavTerminu = 'chybi' | 'po_terminu' | 'dnes' | 'brzy' | 'pozdeji'

/**
 * Do kdy se termín počítá jako „brzy". Sedm dnů proto, že nejkratší interval
 * v CNC matici je týden - kratší okno by u týdenních úkonů nikdy nevysvítilo.
 */
const OKNO_BRZY_DNU = 7

export function stavTerminu(termin: string | null, dnes: string): StavTerminu {
  const zpozdeni = zpozdeniDnu(termin, dnes)

  if (zpozdeni === null) return 'chybi'
  if (zpozdeni > 0) return 'po_terminu'
  if (zpozdeni === 0) return 'dnes'
  if (zpozdeni >= -OKNO_BRZY_DNU) return 'brzy'
  return 'pozdeji'
}

/**
 * Termín slovy, jak ho uvidí technik: „po termínu o 3 dny", „dnes", „za týden".
 * Zítřek a včerejšek dostávají vlastní tvar - „za 1 den" nikdo neřekne.
 */
export function popisTerminu(termin: string | null, dnes: string): string {
  const zpozdeni = zpozdeniDnu(termin, dnes)

  if (zpozdeni === null) return 'termín nezadán'
  if (zpozdeni === 0) return 'dnes'
  if (zpozdeni === 1) return 'včera'
  if (zpozdeni === -1) return 'zítra'

  if (zpozdeni > 0) {
    return `po termínu o ${zpozdeni} ${jednotkaIntervalu('dny', zpozdeni)}`
  }

  const zbyva = -zpozdeni
  return `za ${zbyva} ${jednotkaIntervalu('dny', zbyva)}`
}

/** Hotovo z celkem v procentech. Prázdný checklist je sto procent, ne dělení nulou. */
export function procentoHotovo(hotovo: number, celkem: number): number {
  if (celkem <= 0) return 100
  return Math.round((hotovo / celkem) * 100)
}
