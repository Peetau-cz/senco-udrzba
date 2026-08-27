/**
 * Pravidla zápisu do provozního deníku (zadání ř. 134-144).
 *
 * Bez závislosti na Reactu, Supabase i webových API, aby šel soubor testovat
 * samostatně (zasah.test.ts). Skutečnou hranicí zůstává databáze - omezení
 * z migrace 0020 platí i pro volání API napřímo; tohle je kvůli hláškám.
 */

import { POVOLENE_TYPY_FOTEK } from '@/lib/plan/fotky'

/**
 * Nabídka doby trvání jedním klepnutím.
 *
 * Doba je volitelná (rozhodnutí z 26. 8. 2026) a zůstala by prázdná, kdyby se
 * měla vyťukávat na tabletu. Tři nejčastější délky jako tlačítka jsou způsob,
 * jak zvednout vyplněnost pohodlím místo povinnosti.
 */
export const NABIDKA_DOBY_MIN = [15, 30, 60] as const

/** 24 hodin, shodně s omezením provozni_denik_doba_je_rozumna v migraci 0020. */
export const MAX_DOBA_MIN = 1440

/**
 * Popis je povinný. Druh sám o sobě („Výměna hadice") za rok nikomu neřekne,
 * která hadice a proč - a je to jeden řádek textu.
 */
export const MAX_DELKA_POPISU = 500

const PASMO = 'Europe/Prague'

/** Vrací hlášku pro uživatele, nebo null když je vše v pořádku. */
export function overPopis(popis: string): string | null {
  const ocisteny = popis.trim()

  if (!ocisteny) return 'Popište, co se dělo. Bez toho je zápis za rok k ničemu.'
  if (ocisteny.length > MAX_DELKA_POPISU) {
    return `Popis je delší než ${MAX_DELKA_POPISU} znaků.`
  }

  return null
}

export type VysledekDoby = { hodnota: number | null } | { chyba: string }

/**
 * Doba trvání z formuláře. Prázdné pole je platná odpověď - většina zásahů se
 * zapíše bez ní a je to tak v pořádku.
 */
export function overDobu(text: string): VysledekDoby {
  const ocisteny = text.trim()
  if (!ocisteny) return { hodnota: null }

  if (!/^\d+$/.test(ocisteny)) return { chyba: 'Dobu trvání zadejte v celých minutách.' }

  const minut = Number(ocisteny)
  if (minut < 1) return { chyba: 'Doba trvání musí být aspoň minuta.' }
  if (minut > MAX_DOBA_MIN) {
    return { chyba: 'Zásah delší než 24 hodin je oprava, ne řádek v deníku.' }
  }

  return { hodnota: minut }
}

/** „1 h 30 min". Hodiny se ukazují až od hodiny - „90 min" se hůř odhaduje. */
export function formatDobu(minut: number | null | undefined): string {
  if (minut == null) return '—'
  if (minut < 60) return `${minut} min`

  const hodin = Math.floor(minut / 60)
  const zbytek = minut % 60

  return zbytek === 0 ? `${hodin} h` : `${hodin} h ${zbytek} min`
}

/**
 * Kód druhu zásahu se odvozuje z názvu, uživatel ho nezadává - obrazovka má mít
 * jedno políčko místo dvou. Malá písmena schválně: šest druhů ze zadání založila
 * migrace 0020 jako `vymena_zarovky` a číselník má vypadat jednotně i po tom,
 * co si vedoucí údržby doplní vlastní.
 */
export function kodDruhu(nazev: string, obsazene: readonly string[] = []): string {
  const zaklad = nazev
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)

  if (!zaklad) return ''

  const zabrane = new Set(obsazene)
  if (!zabrane.has(zaklad)) return zaklad

  for (let poradi = 2; poradi < 100; poradi += 1) {
    const kandidat = `${zaklad}_${poradi}`
    if (!zabrane.has(kandidat)) return kandidat
  }

  return ''
}

/**
 * Cesta k fotce v úložišti: `<id zápisu>/<náhodnost>.<přípona>`.
 *
 * První složka je id zápisu - politiky v migraci 0022 podle ní rozhodují
 * o přístupu i o tom, jestli je zápis ještě v okně na opravu.
 */
export function cestaFotkyZasahu(zapisId: string, mime: string, nahodnost: string): string {
  const pripona = POVOLENE_TYPY_FOTEK[mime] ?? 'bin'
  return `${zapisId}/${nahodnost}.${pripona}`
}

/**
 * Převede hodnotu z pole `datetime-local` na okamžik v ISO.
 *
 * Prohlížeč pošle místní čas bez pásma („2026-07-15T08:30") a server běží
 * v UTC. `new Date(hodnota)` by ho tedy vzal jako UTC a zásah by v historii
 * seděl o dvě hodiny jinde - v létě jinak než v zimě, takže by si toho nikdo
 * nevšiml podle vzoru.
 *
 * Hodnota se proto čte jako pražský čas, stejně jako se všechny časy zobrazují
 * (lib/datum.ts). Posun se hledá ve dvou krocích, protože sám závisí na
 * okamžiku, který teprve počítáme - druhý krok srovná přechod na letní čas.
 */
export function pragskyCasNaIso(text: string): string | null {
  const shoda = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(text.trim())
  if (!shoda) return null

  const cislo = (poradi: number) => Number(shoda[poradi])

  const jakoKdybyUtc = Date.UTC(cislo(1), cislo(2) - 1, cislo(3), cislo(4), cislo(5))
  let okamzik = new Date(jakoKdybyUtc)

  for (let krok = 0; krok < 2; krok += 1) {
    okamzik = new Date(jakoKdybyUtc - posunPasmaMin(okamzik) * 60_000)
  }

  return Number.isNaN(okamzik.getTime()) ? null : okamzik.toISOString()
}

/** O kolik minut je Praha napřed proti UTC v daném okamžiku (60 nebo 120). */
function posunPasmaMin(okamzik: Date): number {
  const casti = new Intl.DateTimeFormat('en-US', {
    timeZone: PASMO,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(okamzik)

  const cast = (typ: string) => Number(casti.find((p) => p.type === typ)?.value ?? '0')

  const mistni = Date.UTC(
    cast('year'),
    cast('month') - 1,
    cast('day'),
    cast('hour'),
    cast('minute'),
    cast('second'),
  )

  return Math.round((mistni - okamzik.getTime()) / 60_000)
}

/**
 * Hodnota pro předvyplnění pole `datetime-local`: teď, v pražském čase.
 *
 * Zásah se zapisuje po směně, takže „teď" je skoro vždycky blízko pravdy
 * a zbytek si uživatel posune.
 */
export function nyniProFormular(okamzik: Date = new Date()): string {
  const casti = new Intl.DateTimeFormat('sv-SE', {
    timeZone: PASMO,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(okamzik)

  const cast = (typ: string) => casti.find((p) => p.type === typ)?.value ?? '00'

  return `${cast('year')}-${cast('month')}-${cast('day')}T${cast('hour')}:${cast('minute')}`
}
