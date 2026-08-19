/**
 * Vyplněné kontrolní body kroku zakázky.
 *
 * Zadání bodu i odpověď technika leží v jednom poli, ne ve dvou zarovnaných:
 *   [{"nazev": "1000 ot.",     "typ": "hodnota", "hodnota": 4.2},
 *    {"nazev": "Kryt dotažen", "typ": "ano_ne",  "ano": true}]
 *
 * Zrcadlí funkci jsou_platne_odpovedi_bodu() z migrace 0011. Autoritou zůstává
 * databáze (zásada R1) - a navíc trigger hlídá, že se při vyplňování nezměnilo
 * zadání, tedy dvojice název + druh. Tenhle soubor proto odpovědi doplňuje
 * do PŘEČTENÉHO pole a nikdy je neskládá znovu od nuly.
 *
 * Bez závislosti na Reactu a Supabase - testuje se samostatně (body.test.ts).
 */

import { jeDruhBodu, type DruhBodu } from '@/lib/sablony/kontrolni-body'

export type VyplnenyBod = {
  nazev: string
  typ: DruhBodu
  /** Naměřená hodnota u bodu druhu `hodnota`. Null = technik nevyplnil. */
  hodnota: number | null
  /** Odpověď u bodu druhu `ano_ne`. Null = technik nevyplnil. */
  ano: boolean | null
}

/** Přečte body z JSONB. Co nedává smysl, se přeskočí - lepší než spadnout. */
export function prectiVyplneneBody(surove: unknown): VyplnenyBod[] {
  if (!Array.isArray(surove)) return []

  const body: VyplnenyBod[] = []

  for (const prvek of surove) {
    if (!prvek || typeof prvek !== 'object') continue

    const zaznam = prvek as Record<string, unknown>
    const nazev = typeof zaznam.nazev === 'string' ? zaznam.nazev.trim() : ''
    if (nazev === '') continue

    const typ: DruhBodu = jeDruhBodu(zaznam.typ) ? zaznam.typ : 'hodnota'

    body.push({
      nazev,
      typ,
      hodnota: typ === 'hodnota' && typeof zaznam.hodnota === 'number' ? zaznam.hodnota : null,
      ano: typ === 'ano_ne' && typeof zaznam.ano === 'boolean' ? zaznam.ano : null,
    })
  }

  return body
}

/**
 * Bod, jak se ukládá do JSONB. Typový alias schválně, ne rozhraní - jen alias
 * je přiřaditelný do `Json` z typů databáze, které má indexovou signaturu.
 */
export type BodKUlozeni = {
  nazev: string
  typ: DruhBodu
  hodnota?: number
  ano?: boolean
}

/**
 * Doplní odpovědi a vrátí tvar k uložení.
 *
 * Odpovědi přicházejí podle pořadí bodu, protože formulář nemá nic
 * jedinečnějšího - dva body téhož úkonu se můžou jmenovat stejně. Zadání se
 * bere z `puvodni`, nikdy z formuláře: kdyby si ho zápis nesl s sebou, dal by
 * se cestou přepsat a zamrazená matice by přestala platit. Trigger v databázi
 * by takový zápis stejně odmítl, tohle je proto, aby k němu nedošlo.
 *
 * Nevyplněný klíč se vypouští úplně, místo `null`. Obojí databáze bere, ale
 * chybějící klíč je jednoznačnější: bod, na který nikdo neodpověděl.
 */
export function doplnOdpovedi(
  puvodni: VyplnenyBod[],
  odpovedi: { hodnota?: string | null; ano?: boolean | null }[],
): BodKUlozeni[] {
  return puvodni.map((bod, poradi) => {
    const odpoved = odpovedi[poradi]
    const zaklad: BodKUlozeni = { nazev: bod.nazev, typ: bod.typ }

    if (bod.typ === 'hodnota') {
      const cislo = prectiCislo(odpoved?.hodnota ?? null)
      if (cislo !== null) zaklad.hodnota = cislo
      return zaklad
    }

    const ano = odpoved?.ano
    if (typeof ano === 'boolean') zaklad.ano = ano
    return zaklad
  })
}

/**
 * Číslo z formulářového pole. Přijímá i desetinnou čárku - technik na tabletu
 * napíše „4,2" a odmítnout mu to kvůli tečce by bylo malicherné.
 */
export function prectiCislo(text: string | null | undefined): number | null {
  if (typeof text !== 'string') return null

  const cisty = text.trim().replace(',', '.')
  if (cisty === '') return null

  const cislo = Number(cisty)
  return Number.isFinite(cislo) ? cislo : null
}

/** Zbývá ještě něco vyplnit? Nevyplněný bod nebrání potvrzení, ale je vidět. */
export function pocetNevyplnenych(body: VyplnenyBod[]): number {
  return body.filter((bod) => (bod.typ === 'hodnota' ? bod.hodnota === null : bod.ano === null))
    .length
}

/**
 * Je naměřená hodnota v mezích? Null, když se nedá rozhodnout - buď hodnota
 * chybí, nebo mez není zadaná. Mez je vodítko, ne zákaz: hodnota mimo se uloží
 * a zůstane v historii, jen se u ní ukáže, že vybočila.
 */
export function jeVMezich(
  hodnota: number | null,
  min: number | null,
  max: number | null,
): boolean | null {
  if (hodnota === null) return null
  if (min === null && max === null) return null

  if (min !== null && hodnota < min) return false
  if (max !== null && hodnota > max) return false
  return true
}

/** Meze slovy: „3,5–5,0 l", „min. 3,5 l", „max. 5,0 l". */
export function popisMezi(
  min: number | null,
  max: number | null,
  jednotka: string | null,
): string {
  const jed = jednotka ? ` ${jednotka}` : ''

  if (min !== null && max !== null) return `mez ${cislo(min)}–${cislo(max)}${jed}`
  if (min !== null) return `min. ${cislo(min)}${jed}`
  if (max !== null) return `max. ${cislo(max)}${jed}`
  return ''
}

function cislo(hodnota: number): string {
  return hodnota.toString().replace('.', ',')
}
