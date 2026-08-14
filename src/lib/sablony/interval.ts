/**
 * Intervaly údržby.
 *
 * Rozhodnutí P1: intervaly jsou pouze kalendářní. Motohodiny ani počty cyklů
 * zadání nepožaduje a stroje je dnes nehlásí.
 *
 * Bez závislosti na Reactu a Supabase, aby šel soubor testovat samostatně
 * (interval.test.ts). Zrcadlí enumy interval_typ a interval_zaklad z migrace 0006.
 */

export const TYPY_INTERVALU = [
  { hodnota: 'dny', popisek: 'dny' },
  { hodnota: 'tydny', popisek: 'týdny' },
  { hodnota: 'mesice', popisek: 'měsíce' },
  { hodnota: 'roky', popisek: 'roky' },
] as const

export type TypIntervalu = (typeof TYPY_INTERVALU)[number]['hodnota']

export function jeTypIntervalu(hodnota: string): hodnota is TypIntervalu {
  return TYPY_INTERVALU.some((t) => t.hodnota === hodnota)
}

/**
 * Rozhodnutí P2. Rozdíl je vidět až u zpožděné údržby: `od_planu` drží původní
 * kalendář, `od_provedeni` posune i všechny další termíny.
 *
 * První v pořadí je `od_planu`, protože je to výchozí hodnota (migrace 0009):
 * v SENCU je termín vždy k pevně danému datu. Nastavitelné to zůstává na úkonu.
 */
export const ZAKLADY_INTERVALU = [
  { hodnota: 'od_planu', popisek: 'od plánovaného termínu' },
  { hodnota: 'od_provedeni', popisek: 'od skutečného provedení' },
] as const

export type ZakladIntervalu = (typeof ZAKLADY_INTERVALU)[number]['hodnota']

export function jeZakladIntervalu(hodnota: string): hodnota is ZakladIntervalu {
  return ZAKLADY_INTERVALU.some((z) => z.hodnota === hodnota)
}

/**
 * Skloňování jednotek. Čeština má tři tvary podle počtu (1 / 2-4 / 5 a víc)
 * a všechny čtyři jednotky jsou shodou okolností rodu mužského, takže „každý"
 * platí pro jedničku u všech.
 */
const TVARY: Record<TypIntervalu, [string, string, string]> = {
  dny: ['den', 'dny', 'dnů'],
  tydny: ['týden', 'týdny', 'týdnů'],
  mesice: ['měsíc', 'měsíce', 'měsíců'],
  roky: ['rok', 'roky', 'let'],
}

/** Jednotka ve správném tvaru pro daný počet: 1 měsíc · 3 měsíce · 5 měsíců. */
export function jednotkaIntervalu(typ: TypIntervalu, pocet: number): string {
  const [jeden, dva, pet] = TVARY[typ]
  if (pocet === 1) return jeden
  if (pocet >= 2 && pocet <= 4) return dva
  return pet
}

/**
 * Interval slovy, jak ho uvidí technik v checklistu: „každý měsíc",
 * „každé 3 měsíce", „každých 6 měsíců".
 */
export function popisIntervalu(typ: TypIntervalu, hodnota: number): string {
  const jednotka = jednotkaIntervalu(typ, hodnota)

  if (hodnota === 1) return `každý ${jednotka}`
  if (hodnota >= 2 && hodnota <= 4) return `každé ${hodnota} ${jednotka}`
  return `každých ${hodnota} ${jednotka}`
}

/** Tolerance po termínu: „bez tolerance", „+ 1 den", „+ 7 dnů". */
export function popisTolerance(dny: number): string {
  if (dny <= 0) return 'bez tolerance'
  return `+ ${dny} ${jednotkaIntervalu('dny', dny)}`
}
