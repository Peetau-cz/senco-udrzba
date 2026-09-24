/**
 * Dotazy nad šablonami údržby.
 *
 * Stejně jako u zařízení tu není podmínka na oblast uživatele - politiky
 * z migrace 0006 stojí nad ma_pristup_k_oblasti(), takže specialista CNC
 * dostane ze stejného dotazu jen své šablony. Druhý filtr v kódu by byl druhá
 * pravda, kterou by nikdo neudržoval (zásada R1).
 */

import { vytvorServerovehoKlienta } from '@/lib/supabase/server'
import type { Database, Json } from '@/types/database.types'

type StavVerze = Database['public']['Enums']['stav_verze']
type IntervalTyp = Database['public']['Enums']['interval_typ']
type IntervalZaklad = Database['public']['Enums']['interval_zaklad']
type StavZarizeni = Database['public']['Enums']['stav_zarizeni']

const SLOUPCE_SEZNAMU = `
  id, kod, nazev, popis, aktivni, zmeneno_at,
  oblast (id, kod, nazev),
  verze:sablona_verze (id, cislo_verze, stav, platna_od),
  zarizeni_sablona (count)
` as const

/**
 * Řádek seznamu šablon. Tvar, na který se spoléhají komponenty - při výměně
 * datové vrstvy se nemění, mění se jen dotaz, který ho plní.
 */
export type SablonaVSeznamu = {
  id: string
  kod: string
  nazev: string
  popis: string | null
  aktivni: boolean
  zmeneno_at: string
  oblast: { id: string; kod: string; nazev: string }
  verze: { id: string; cislo_verze: number; stav: StavVerze; platna_od: string | null }[]
  /** Počet přiřazených strojů. Vnořený součet chodí jako pole s jedním prvkem, viz `pocetZarizeniSablony`. */
  zarizeni_sablona: { count: number }[]
}

/** Hlavička šablony. Tvar, na který se spoléhají komponenty - při výměně datové vrstvy se nemění. */
export type Sablona = {
  id: string
  oblast_id: string
  kod: string
  nazev: string
  popis: string | null
  aktivni: boolean
  vytvoreno_at: string
  zmeneno_at: string
  oblast: { id: string; kod: string; nazev: string }
}

/** Verze šablony. Tvar, na který se spoléhají komponenty - při výměně datové vrstvy se nemění. */
export type VerzeSablony = {
  id: string
  cislo_verze: number
  stav: StavVerze
  platna_od: string | null
  poznamka_ke_zmene: string | null
  vytvoreno_at: string
  vytvoril: { id: string; jmeno: string; prijmeni: string; email: string | null } | null
  /** Počet úkonů. Vnořený součet chodí jako pole s jedním prvkem, viz `pocetUkonu`. */
  sablona_ukon: { count: number }[]
}

const SLOUPCE_UKONU = `
  id, klic, poradi, nazev, popis, interval_typ, interval_hodnota, interval_zaklad,
  tolerance_dny, kontrolni_body, vyzaduje_foto, vyzaduje_hodnotu, nabizi_poznamku,
  jednotka, mez_min, mez_max,
  profese:profese_role_id (id, kod, nazev)
` as const

/** Úkon matice. Tvar, na který se spoléhají komponenty - při výměně datové vrstvy se nemění. */
export type UkonMatice = {
  id: string
  klic: string
  poradi: number
  nazev: string
  popis: string | null
  interval_typ: IntervalTyp
  interval_hodnota: number
  interval_zaklad: IntervalZaklad
  tolerance_dny: number
  kontrolni_body: Json
  vyzaduje_foto: boolean
  vyzaduje_hodnotu: boolean
  nabizi_poznamku: boolean
  jednotka: string | null
  mez_min: number | null
  mez_max: number | null
  profese: { id: string; kod: string; nazev: string }
}

/**
 * Stroj v nabídce k přiřazení i uvnitř přiřazení. Tvar, na který se spoléhají
 * komponenty - při výměně datové vrstvy se nemění.
 */
export type ZarizeniKPrirazeni = {
  id: string
  nazev: string
  inventarni_cislo: string | null
  stav: StavZarizeni
  typ: { id: string; nazev: string }
}

/** Přiřazení šablony ke stroji. Tvar, na který se spoléhají komponenty - při výměně datové vrstvy se nemění. */
export type PrirazeneZarizeni = {
  zarizeni_id: string
  prirazeno_od: string
  zarizeni: ZarizeniKPrirazeni
}

/** Profese, tedy role z číselníku. Tvar, na který se spoléhají komponenty - při výměně datové vrstvy se nemění. */
export type Profese = { id: string; kod: string; nazev: string }

export type FiltrSablon = {
  oblastId?: string
  nazev?: string
  /** Vyřazené šablony se v nabídce běžně nezobrazují. */
  vcetneNeaktivnich?: boolean
}

function ocistiHledani(text: string): string {
  return text
    .replace(/[,()*%\\]/g, ' ')
    .trim()
    .slice(0, 80)
}

export async function nactiSablony(filtr: FiltrSablon = {}): Promise<SablonaVSeznamu[]> {
  const supabase = await vytvorServerovehoKlienta()

  let dotaz = supabase.from('sablona').select(SLOUPCE_SEZNAMU).order('nazev')

  if (filtr.oblastId) dotaz = dotaz.eq('oblast_id', filtr.oblastId)
  if (!filtr.vcetneNeaktivnich) dotaz = dotaz.eq('aktivni', true)

  const nazev = filtr.nazev ? ocistiHledani(filtr.nazev) : ''
  if (nazev) dotaz = dotaz.or(`nazev.ilike.%${nazev}%,kod.ilike.%${nazev}%`)

  const { data, error } = await dotaz

  if (error) throw new Error(`Nepodařilo se načíst šablony: ${error.message}`)

  return data ?? []
}

export async function nactiSablonu(id: string): Promise<Sablona | null> {
  const supabase = await vytvorServerovehoKlienta()

  // maybeSingle, ne single: cizí šablonu RLS odfiltruje a dotaz vrátí prázdno.
  // To není chyba, to je odepřený přístup - a ten se má projevit jako 404.
  const { data, error } = await supabase
    .from('sablona')
    .select(
      `
      id, oblast_id, kod, nazev, popis, aktivni, vytvoreno_at, zmeneno_at,
      oblast (id, kod, nazev)
    `,
    )
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(`Nepodařilo se načíst šablonu: ${error.message}`)

  return data
}

/** Verze od nejnovější. Návrh je vždy nahoře, protože se na něm pracuje. */
export async function nactiVerze(sablonaId: string): Promise<VerzeSablony[]> {
  const supabase = await vytvorServerovehoKlienta()

  const { data, error } = await supabase
    .from('sablona_verze')
    .select(
      `
      id, cislo_verze, stav, platna_od, poznamka_ke_zmene, vytvoreno_at,
      vytvoril:vytvoril_id (id, jmeno, prijmeni, email),
      sablona_ukon (count)
    `,
    )
    .eq('sablona_id', sablonaId)
    .order('cislo_verze', { ascending: false })

  if (error) throw new Error(`Nepodařilo se načíst verze šablony: ${error.message}`)

  return data ?? []
}

/** Vnořený součet chodí jako pole s jedním prvkem, ne jako číslo. */
export function pocetUkonu(verze: { sablona_ukon?: { count: number }[] | null }): number {
  return verze.sablona_ukon?.[0]?.count ?? 0
}

export function pocetZarizeniSablony(sablona: {
  zarizeni_sablona?: { count: number }[] | null
}): number {
  return sablona.zarizeni_sablona?.[0]?.count ?? 0
}

/**
 * Právě platná verze, nebo null. Čte se ze stavu, ne z ukazatele na šabloně -
 * ten schválně neexistuje, viz NAVRH.md kap. 2.3.
 */
export function aktivniVerze<T extends { stav: string }>(verze: T[]): T | undefined {
  return verze.find((v) => v.stav === 'aktivni')
}

export function navrhVerze<T extends { stav: string }>(verze: T[]): T | undefined {
  return verze.find((v) => v.stav === 'navrh')
}

export async function nactiUkony(verzeId: string): Promise<UkonMatice[]> {
  const supabase = await vytvorServerovehoKlienta()

  const { data, error } = await supabase
    .from('sablona_ukon')
    .select(SLOUPCE_UKONU)
    .eq('sablona_verze_id', verzeId)
    .order('poradi')

  if (error) throw new Error(`Nepodařilo se načíst matici: ${error.message}`)

  return data ?? []
}

export async function nactiPrirazenaZarizeni(sablonaId: string): Promise<PrirazeneZarizeni[]> {
  const supabase = await vytvorServerovehoKlienta()

  const { data, error } = await supabase
    .from('zarizeni_sablona')
    .select(
      `
      zarizeni_id, prirazeno_od,
      zarizeni (id, nazev, inventarni_cislo, stav, typ:typ_zarizeni (id, nazev))
    `,
    )
    .eq('sablona_id', sablonaId)

  if (error) throw new Error(`Nepodařilo se načíst přiřazená zařízení: ${error.message}`)

  // Řadí se až tady: podle názvu zařízení, což je vnořený sloupec, a ten
  // PostgREST v `order` u vazební tabulky spolehlivě neseřadí.
  return (data ?? []).sort((a, b) =>
    (a.zarizeni?.nazev ?? '').localeCompare(b.zarizeni?.nazev ?? '', 'cs'),
  )
}

/**
 * Zařízení, kterým jde šablona přiřadit.
 *
 * Nabízí se jen stroje z oblasti šablony - cizí by neprošly složeným cizím
 * klíčem. Už přiřazené se odfiltrují až v paměti, protože jich jsou jednotky.
 */
export async function nactiZarizeniProPrirazeni(oblastId: string): Promise<ZarizeniKPrirazeni[]> {
  const supabase = await vytvorServerovehoKlienta()

  const { data, error } = await supabase
    .from('zarizeni')
    .select('id, nazev, inventarni_cislo, stav, typ:typ_zarizeni (id, nazev)')
    .eq('oblast_id', oblastId)
    .neq('stav', 'vyrazeno')
    .order('nazev')

  if (error) throw new Error(`Nepodařilo se načíst zařízení: ${error.message}`)

  return data ?? []
}

/** Profese pro sloupec „kdo úkon provádí". Je to číselník rolí z migrace 0001. */
export async function nactiProfese(): Promise<Profese[]> {
  const supabase = await vytvorServerovehoKlienta()

  const { data, error } = await supabase.from('role').select('id, kod, nazev').order('poradi')

  if (error) throw new Error(`Nepodařilo se načíst profese: ${error.message}`)

  return data ?? []
}
