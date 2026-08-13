/**
 * Editor vlastních parametrů typu zařízení.
 *
 * Ve formuláři jsou parametry řádky, v databázi jsou to klíče v JSONB. Tenhle
 * soubor obojí převádí a hlídá, aby z editoru nevyšlo schéma, které databáze
 * odmítne - omezení `typ_zarizeni_schema_ma_platny_tvar` z migrace 0003 zná
 * stejná pravidla.
 *
 * Bez závislosti na Reactu i na Supabase, aby šel testovat samostatně.
 */

import type { DefiniceParametru, SchemaParametru, TypParametru } from './parametry'

/** Řádek editoru. Vše je text, protože z formuláře nic jiného nechodí. */
export type RadekParametru = {
  klic: string
  popisek: string
  typ: TypParametru
  jednotka: string
  povinne: boolean
  /** Možnosti výběru, jedna na řádek. */
  moznosti: string
}

export const PRAZDNY_RADEK: RadekParametru = {
  klic: '',
  popisek: '',
  typ: 'text',
  jednotka: '',
  povinne: false,
  moznosti: '',
}

/** Klíč smí být jen bez diakritiky a v snake_case - je to název sloupce v datech. */
const KLIC = /^[a-z][a-z0-9_]*$/

const MAX_DELKA_KLICE = 40

/**
 * Odvodí klíč z popisku: „Otáčky vřetene" → `otacky_vretene`.
 *
 * Garant tak klíč vůbec nemusí řešit, ale může ho přepsat - jednou zvolený klíč
 * je v datech natrvalo a přejmenování by znamenalo ztrátu hodnot u strojů.
 */
export function klicZPopisku(popisek: string): string {
  const bezDiakritiky = popisek
    .normalize('NFD')
    // Rozložená diakritika (háčky a čárky) po normalizaci NFD.
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

  const klic = bezDiakritiky
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, MAX_DELKA_KLICE)
    .replace(/_+$/g, '')

  // Klíč musí začínat písmenem: „3. osa" by jinak dalo `3_osa`.
  return /^[a-z]/.test(klic) ? klic : klic ? `p_${klic}`.slice(0, MAX_DELKA_KLICE) : ''
}

export function moznostiZTextu(text: string): string[] {
  return text
    .split('\n')
    .map((m) => m.trim())
    .filter(Boolean)
}

/** Převede uložené schéma na řádky editoru. Pořadí drží podle klíčů. */
export function schemaNaRadky(schema: SchemaParametru): RadekParametru[] {
  return Object.entries(schema).map(([klic, definice]) => ({
    klic,
    popisek: definice.popisek ?? '',
    typ: definice.typ,
    jednotka: definice.jednotka ?? '',
    povinne: definice.povinne === true,
    moznosti: (definice.moznosti ?? []).join('\n'),
  }))
}

/**
 * Sestaví schéma z řádků editoru. Chyby jsou indexované číslem řádku, aby je
 * formulář ukázal u konkrétního parametru.
 */
export function radkyNaSchema(radky: RadekParametru[]): {
  schema: SchemaParametru
  chyby: Record<number, string>
} {
  const schema: SchemaParametru = {}
  const chyby: Record<number, string> = {}
  const videneKlice = new Set<string>()

  radky.forEach((radek, index) => {
    const popisek = radek.popisek.trim()
    const klic = (radek.klic.trim() || klicZPopisku(popisek)).trim()

    if (!popisek) {
      chyby[index] = 'Zadejte popisek parametru.'
      return
    }

    if (!klic) {
      chyby[index] = 'Z popisku nejde odvodit klíč. Vyplňte ho ručně.'
      return
    }

    if (!KLIC.test(klic)) {
      chyby[index] = 'Klíč smí mít jen malá písmena bez diakritiky, číslice a podtržítka.'
      return
    }

    if (klic.length > MAX_DELKA_KLICE) {
      chyby[index] = `Klíč je delší než ${MAX_DELKA_KLICE} znaků.`
      return
    }

    if (videneKlice.has(klic)) {
      chyby[index] = `Klíč „${klic}" už má jiný parametr.`
      return
    }

    const moznosti = moznostiZTextu(radek.moznosti)

    if (radek.typ === 'vyber' && moznosti.length === 0) {
      chyby[index] = 'U výběru vypište aspoň jednu možnost.'
      return
    }

    videneKlice.add(klic)

    const definice: DefiniceParametru = { typ: radek.typ, poradi: index }
    if (popisek) definice.popisek = popisek
    if (radek.jednotka.trim()) definice.jednotka = radek.jednotka.trim()
    if (radek.povinne) definice.povinne = true
    if (radek.typ === 'vyber') definice.moznosti = moznosti

    schema[klic] = definice
  })

  return { schema, chyby }
}

/** Klíče, které ve schématu ubyly. Podle nich se garant varuje před ztrátou dat. */
export function odebraneKlice(puvodni: SchemaParametru, nove: SchemaParametru): string[] {
  return Object.keys(puvodni).filter((klic) => !(klic in nove))
}
