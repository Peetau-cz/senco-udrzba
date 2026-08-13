/**
 * Vlastní technické parametry zařízení (zadání ř. 93, docs/NAVRH.md kap. 2.2).
 *
 * Každý typ zařízení si v `schema_parametru` nese definici polí, která se u jeho
 * strojů evidují. Frézka tak může mít otáčky vřetene, ohraňovák délku lisovnice,
 * a přidání dalšího parametru je změna dat, ne nasazení nové verze.
 *
 * DŮLEŽITÉ: tenhle soubor je zdvojení, ne autorita. Stejná pravidla vynucuje
 * trigger `zkontroluj_parametry_zarizeni()` v migraci 0003. Tady jsou proto, aby
 * uživatel dostal hlášku u pole ve formuláři, ne surovou chybu z databáze.
 * Kdyby se obojí rozešlo, zápis neprojde - poslední slovo má databáze.
 *
 * Soubor je záměrně bez závislosti na Reactu, Supabase i FormData, aby šel
 * testovat samostatně (parametry.test.ts).
 */

export const TYPY_PARAMETRU = ['text', 'cislo', 'ano_ne', 'vyber'] as const

export type TypParametru = (typeof TYPY_PARAMETRU)[number]

export type DefiniceParametru = {
  typ: TypParametru
  /** Co se ukáže u pole. Bez něj se použije klíč. */
  popisek?: string
  /** Jednotka za polem - 1/min, mm, bar. Jen popisná, do hodnoty nevstupuje. */
  jednotka?: string
  povinne?: boolean
  /** Povinné a neprázdné u typu 'vyber', jinak se pole nedá vyplnit. */
  moznosti?: string[]
}

export type SchemaParametru = Record<string, DefiniceParametru>

export type HodnotaParametru = string | number | boolean | null

export type HodnotyParametru = Record<string, HodnotaParametru>

function jeObjekt(hodnota: unknown): hodnota is Record<string, unknown> {
  return typeof hodnota === 'object' && hodnota !== null && !Array.isArray(hodnota)
}

/**
 * Přečte schéma z databázového JSONB.
 *
 * Databáze tvar hlídá omezením `typ_zarizeni_schema_ma_platny_tvar`, tady se
 * jen bezpečně zúží typ. Nepoužitelnou definici raději zahodíme, než abychom
 * kvůli ní shodili celou stránku - formulář pak ukáže o pole méně.
 */
export function prectiSchema(surove: unknown): SchemaParametru {
  if (!jeObjekt(surove)) return {}

  const schema: SchemaParametru = {}

  for (const [klic, definice] of Object.entries(surove)) {
    if (!jeObjekt(definice)) continue

    const typ = definice.typ
    if (typeof typ !== 'string' || !(TYPY_PARAMETRU as readonly string[]).includes(typ)) continue

    const moznosti = Array.isArray(definice.moznosti)
      ? definice.moznosti.filter((m): m is string => typeof m === 'string')
      : undefined

    if (typ === 'vyber' && (!moznosti || moznosti.length === 0)) continue

    schema[klic] = {
      typ: typ as TypParametru,
      popisek: typeof definice.popisek === 'string' ? definice.popisek : undefined,
      jednotka: typeof definice.jednotka === 'string' ? definice.jednotka : undefined,
      povinne: definice.povinne === true,
      moznosti,
    }
  }

  return schema
}

export function popisekParametru(klic: string, definice: DefiniceParametru): string {
  return definice.popisek?.trim() || klic
}

/** Hodnota, jak se ukáže v kartě zařízení. */
export function zobrazHodnotu(definice: DefiniceParametru, hodnota: HodnotaParametru): string {
  if (hodnota === null || hodnota === '') return '—'
  if (definice.typ === 'ano_ne') return hodnota ? 'Ano' : 'Ne'

  const text = typeof hodnota === 'number' ? hodnota.toLocaleString('cs-CZ') : String(hodnota)
  return definice.jednotka ? `${text} ${definice.jednotka}` : text
}

/**
 * Ověří hodnoty proti schématu. Vrací chyby po jednotlivých parametrech, aby je
 * formulář mohl vypsat u příslušného pole. Prázdný objekt znamená, že je vše v
 * pořádku.
 */
export function overParametry(
  schema: SchemaParametru,
  hodnoty: HodnotyParametru,
): Record<string, string> {
  const chyby: Record<string, string> = {}

  // 1. Nic navíc - parametr mimo schéma by se v kartě nikdy neukázal.
  for (const [klic, hodnota] of Object.entries(hodnoty)) {
    const definice = schema[klic]

    if (!definice) {
      chyby[klic] = `Parametr „${klic}" není v schématu typu zařízení.`
      continue
    }

    if (hodnota === null || hodnota === '') continue

    const popisek = popisekParametru(klic, definice)

    if (definice.typ === 'cislo' && (typeof hodnota !== 'number' || !Number.isFinite(hodnota))) {
      chyby[klic] = `${popisek} musí být číslo.`
    } else if (definice.typ === 'text' && typeof hodnota !== 'string') {
      chyby[klic] = `${popisek} musí být text.`
    } else if (definice.typ === 'ano_ne' && typeof hodnota !== 'boolean') {
      chyby[klic] = `${popisek} musí být ano/ne.`
    } else if (
      definice.typ === 'vyber' &&
      (typeof hodnota !== 'string' || !(definice.moznosti ?? []).includes(hodnota))
    ) {
      chyby[klic] = `${popisek} má hodnotu mimo povolený seznam.`
    }
  }

  // 2. Nic nechybí. Pozor: u typu ano_ne je `false` platná vyplněná hodnota.
  for (const [klic, definice] of Object.entries(schema)) {
    if (!definice.povinne || chyby[klic]) continue

    const hodnota = hodnoty[klic]
    const prazdna =
      hodnota === undefined ||
      hodnota === null ||
      (typeof hodnota === 'string' && hodnota.trim() === '')

    if (prazdna) {
      chyby[klic] = `${popisekParametru(klic, definice)} je povinný.`
    }
  }

  return chyby
}

/** Název pole ve formuláři. Prefix drží parametry oddělené od pevných sloupců. */
export function poleParametru(klic: string): string {
  return `parametr_${klic}`
}

/**
 * Poskládá hodnoty parametrů z formuláře.
 *
 * Přebírá funkci pro čtení pole, ne rovnou FormData - díky tomu jde tenhle
 * soubor testovat bez webových API a použít i jinde než v server action.
 *
 * Nevyplněné pole se do výsledku nedostane vůbec; v databázi tak nevzniknou
 * klíče s prázdnou hodnotou, které by se pletly s vyplněnými.
 */
export function hodnotyZFormulare(
  schema: SchemaParametru,
  precti: (nazevPole: string) => string | null,
): { hodnoty: HodnotyParametru; chyby: Record<string, string> } {
  const hodnoty: HodnotyParametru = {}
  const chyby: Record<string, string> = {}

  for (const [klic, definice] of Object.entries(schema)) {
    const surova = precti(poleParametru(klic))

    if (definice.typ === 'ano_ne') {
      // Nezaškrtnuté políčko se v FormData vůbec neobjeví.
      hodnoty[klic] = surova !== null && surova !== '' && surova !== 'false'
      continue
    }

    const text = (surova ?? '').trim()
    if (text === '') continue

    if (definice.typ === 'cislo') {
      // Obsluha v dílně napíše desetinnou čárku, ne tečku.
      const cislo = Number(text.replace(',', '.'))
      if (!Number.isFinite(cislo)) {
        chyby[klic] = `${popisekParametru(klic, definice)} musí být číslo.`
        continue
      }
      hodnoty[klic] = cislo
      continue
    }

    hodnoty[klic] = text
  }

  // Chyby z převodu jsou konkrétnější než „je povinný", které by na nevyplněnou
  // hodnotu jinak řekla kontrola schématu - proto přebíjejí, ne naopak.
  return { hodnoty, chyby: { ...overParametry(schema, hodnoty), ...chyby } }
}
