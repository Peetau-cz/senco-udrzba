/**
 * Výpočty kolem plnění matice — období a procenta.
 *
 * Samotné plnění se počítá v databázi (pohled `v_plneni_matice`, migrace 0018),
 * aby dashboard, obrazovka plnění i export ukázaly totéž číslo. Tady je jen to,
 * co se dopočítává nad hotovým výsledkem.
 *
 * Bez závislosti na Reactu a Supabase, aby šel soubor testovat samostatně
 * (vypocet.test.ts).
 */

const MESICE = [
  'leden',
  'únor',
  'březen',
  'duben',
  'květen',
  'červen',
  'červenec',
  'srpen',
  'září',
  'říjen',
  'listopad',
  'prosinec',
]

/** První den měsíce jako `YYYY-MM-DD`, tedy tvar, ve kterém pohled vrací období. */
export function zacatekMesice(den: string): string {
  return `${den.slice(0, 7)}-01`
}

/** Měsíc slovy: „srpen 2026". */
export function popisObdobi(obdobi: string): string {
  const [rok = '', mesic = ''] = obdobi.split('-')
  const nazev = MESICE[Number(mesic) - 1] ?? ''
  return nazev ? `${nazev} ${rok}` : obdobi
}

/** Nabídka posledních měsíců včetně probíhajícího, od nejnovějšího. */
export function nabidkaObdobi(dnes: string, pocet = 12): string[] {
  const [rok = 0, mesic = 1] = dnes.split('-').map(Number)
  const obdobi: string[] = []

  for (let posun = 0; posun < pocet; posun += 1) {
    // Přes UTC schválně: měsíc se počítá aritmetikou, ne posunem v pásmu,
    // takže se nemá kde ztratit hodina a s ní první den měsíce.
    const datum = new Date(Date.UTC(rok, mesic - 1 - posun, 1))
    obdobi.push(datum.toISOString().slice(0, 10))
  }

  return obdobi
}

/**
 * Plnění v procentech.
 *
 * Měsíc bez jediného splatného úkonu je sto procent, ne nula: nová oblast bez
 * naplánované údržby by jinak vypadala jako nejhorší v podniku, přestože
 * nezanedbala nic.
 */
export function procentoPlneni(splneno: number, celkem: number): number {
  if (celkem <= 0) return 100
  return Math.round((splneno / celkem) * 100)
}

export type RadekPlneni = {
  oblastId: string
  oblastNazev: string
  celkem: number
  splneno: number
  poTerminu: number
  neprovedeno: number
}

export type SouhrnPlneni = Omit<RadekPlneni, 'oblastId' | 'oblastNazev'>

/** Součet přes všechny oblasti, na který se dívá management. */
export function souhrnPlneni(radky: RadekPlneni[]): SouhrnPlneni {
  return radky.reduce<SouhrnPlneni>(
    (soucet, r) => ({
      celkem: soucet.celkem + r.celkem,
      splneno: soucet.splneno + r.splneno,
      poTerminu: soucet.poTerminu + r.poTerminu,
      neprovedeno: soucet.neprovedeno + r.neprovedeno,
    }),
    { celkem: 0, splneno: 0, poTerminu: 0, neprovedeno: 0 },
  )
}
