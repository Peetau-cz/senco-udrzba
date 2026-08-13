/**
 * Ověření formuláře zařízení.
 *
 * Pevné sloupce karty (kap. 2.2). Vlastní technické parametry mají vlastní
 * pravidla v parametry.ts, protože se řídí schématem typu, ne pevným seznamem.
 *
 * Stejně jako u parametrů platí: tohle je pohodlí pro uživatele, hranicí zůstává
 * databáze - omezení `zarizeni_rok_vyroby_v_rozsahu`, unikátní inventární číslo
 * a RLS politiky v migraci 0003.
 */

import { z } from 'zod'

export const STAVY_ZARIZENI = [
  { hodnota: 'v_provozu', popisek: 'V provozu' },
  { hodnota: 'odstaveno', popisek: 'Odstaveno' },
  { hodnota: 'v_oprave', popisek: 'V opravě' },
  { hodnota: 'vyrazeno', popisek: 'Vyřazeno' },
] as const

export type StavZarizeni = (typeof STAVY_ZARIZENI)[number]['hodnota']

export function popisekStavu(stav: string): string {
  return STAVY_ZARIZENI.find((s) => s.hodnota === stav)?.popisek ?? stav
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Prázdné pole formuláře znamená „nevyplněno", tedy NULL - ne prázdný řetězec. */
const nepovinnyText = z
  .string()
  .nullish()
  .transform((v) => (v ?? '').trim())
  .transform((v) => (v === '' ? null : v))

function nepovinnaVazba(hlaska: string) {
  return nepovinnyText.refine((v) => v === null || UUID.test(v), hlaska)
}

export const schemaZarizeni = z.object({
  nazev: z
    .string({ required_error: 'Zadejte název zařízení' })
    .trim()
    .min(1, 'Zadejte název zařízení')
    .max(200, 'Název je příliš dlouhý'),

  typ_zarizeni_id: z
    .string({ required_error: 'Vyberte typ zařízení' })
    .regex(UUID, 'Vyberte typ zařízení'),

  // Nepovinné: stroj se eviduje dřív, než pro něj vznikne štítek. Jedinečnost
  // hlídá databáze, ne tenhle soubor - jiný uživatel může číslo obsadit mezitím.
  inventarni_cislo: nepovinnyText.refine(
    (v) => v === null || v.length <= 50,
    'Inventární číslo je příliš dlouhé',
  ),

  vyrobce: nepovinnyText,
  model: nepovinnyText,
  vyrobni_cislo: nepovinnyText,

  rok_vyroby: nepovinnyText
    .refine((v) => v === null || /^\d{4}$/.test(v), 'Rok výroby zadejte čtyřmístně')
    .transform((v) => (v === null ? null : Number(v)))
    .refine(
      (v) => v === null || (v >= 1900 && v <= 2200),
      'Rok výroby musí být mezi 1900 a 2200',
    ),

  umisteni_id: nepovinnaVazba('Neplatné umístění'),
  odpovedna_osoba_id: nepovinnaVazba('Neplatná odpovědná osoba'),

  stav: z.enum(['v_provozu', 'odstaveno', 'v_oprave', 'vyrazeno'], {
    errorMap: () => ({ message: 'Vyberte stav zařízení' }),
  }),

  poznamka: nepovinnyText,
})

export type VstupZarizeni = z.infer<typeof schemaZarizeni>

/** Pole formuláře, která schéma zná. Sloupec oblast_id se odvozuje z typu. */
const POLE = [
  'nazev',
  'typ_zarizeni_id',
  'inventarni_cislo',
  'vyrobce',
  'model',
  'vyrobni_cislo',
  'rok_vyroby',
  'umisteni_id',
  'odpovedna_osoba_id',
  'stav',
  'poznamka',
] as const

/**
 * Ověří formulář. Přebírá funkci pro čtení pole, ne rovnou FormData - stejný
 * důvod jako u parametrů: testovatelnost bez webových API.
 */
export function overFormularZarizeni(precti: (nazevPole: string) => string | null) {
  // Chybějící pole se srovná na prázdný řetězec, aby uživatel dostal hlášku
  // „Zadejte název", ne zodí „Expected string, received null".
  const surove: Record<string, string> = {}
  for (const pole of POLE) surove[pole] = precti(pole) ?? ''

  return schemaZarizeni.safeParse(surove)
}

/** Chyby zodu na tvar, ve kterém je formulář vypisuje u polí. */
export function chybyPodlePoli(chyba: z.ZodError): Record<string, string> {
  const chyby: Record<string, string> = {}

  for (const problem of chyba.issues) {
    const pole = String(problem.path[0] ?? '')
    if (pole && !chyby[pole]) chyby[pole] = problem.message
  }

  return chyby
}
