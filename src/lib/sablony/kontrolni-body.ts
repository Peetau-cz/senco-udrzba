/**
 * Kontrolní body úkonu.
 *
 * Bod má vedle názvu i druh zápisu:
 *   hodnota - technik na tom místě zapíše naměřenou hodnotu (v jednotce úkonu)
 *   ano_ne  - technik jen odškrtne, že to tak je
 *
 * Zrcadlí funkci jsou_platne_kontrolni_body() z migrace 0007. Autoritou zůstává
 * databáze (zásada R1), tohle je proto, aby uživatel dostal hlášku dřív.
 *
 * Bez závislosti na Reactu a Supabase - testuje se samostatně
 * (kontrolni-body.test.ts).
 */

export const DRUHY_BODU = [
  { hodnota: 'hodnota', popisek: 'naměřená hodnota' },
  { hodnota: 'ano_ne', popisek: 'ano / ne' },
] as const

export type DruhBodu = (typeof DRUHY_BODU)[number]['hodnota']

export type KontrolniBod = {
  nazev: string
  typ: DruhBodu
}

export function jeDruhBodu(hodnota: unknown): hodnota is DruhBodu {
  return DRUHY_BODU.some((d) => d.hodnota === hodnota)
}

export function prazdnyBod(): KontrolniBod {
  return { nazev: '', typ: 'ano_ne' }
}

/**
 * Přečte body z JSONB.
 *
 * Snese i starý tvar - holé pole textů, jak vypadala data před migrací 0007.
 * Ta je sice převedla, ale číst umí obojí: kdyby se někde objevil starý zápis
 * (import, ruční oprava v SQL), je lepší ho zobrazit než spadnout.
 */
export function prectiBody(surove: unknown): KontrolniBod[] {
  if (!Array.isArray(surove)) return []

  const body: KontrolniBod[] = []

  for (const prvek of surove) {
    if (typeof prvek === 'string') {
      const nazev = prvek.trim()
      if (nazev !== '') body.push({ nazev, typ: 'hodnota' })
      continue
    }

    if (prvek && typeof prvek === 'object') {
      const zaznam = prvek as Record<string, unknown>
      const nazev = typeof zaznam.nazev === 'string' ? zaznam.nazev.trim() : ''
      if (nazev === '') continue

      body.push({ nazev, typ: jeDruhBodu(zaznam.typ) ? zaznam.typ : 'hodnota' })
    }
  }

  return body
}

/** Očistí body před uložením. Body bez názvu se zahodí, ne odmítnou. */
export function ocistiBody(body: KontrolniBod[]): KontrolniBod[] {
  return body
    .map((bod) => ({ nazev: bod.nazev.trim(), typ: bod.typ }))
    .filter((bod) => bod.nazev !== '')
}

/** Krátký souhrn do přehledu: „1000 ot. · Kryt dotažen?". */
export function shrnBody(body: KontrolniBod[]): string {
  return body.map((bod) => (bod.typ === 'ano_ne' ? `${bod.nazev}?` : bod.nazev)).join(' · ')
}
