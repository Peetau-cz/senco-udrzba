/**
 * Dotazy nad šablonami údržby.
 *
 * Stejně jako u zařízení tu není podmínka na oblast uživatele - politiky
 * z migrace 0006 stojí nad ma_pristup_k_oblasti(), takže specialista CNC
 * dostane ze stejného dotazu jen své šablony. Druhý filtr v kódu by byl druhá
 * pravda, kterou by nikdo neudržoval (zásada R1).
 */

import { vytvorServerovehoKlienta } from '@/lib/supabase/server'

const SLOUPCE_SEZNAMU = `
  id, kod, nazev, popis, aktivni, zmeneno_at,
  oblast (id, kod, nazev),
  verze:sablona_verze (id, cislo_verze, stav, platna_od),
  zarizeni_sablona (count)
` as const

const SLOUPCE_UKONU = `
  id, poradi, nazev, popis, interval_typ, interval_hodnota, interval_zaklad,
  tolerance_dny, kontrolni_body, vyzaduje_foto, vyzaduje_hodnotu, nabizi_poznamku,
  jednotka, mez_min, mez_max,
  profese:profese_role_id (id, kod, nazev)
` as const

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

export async function nactiSablony(filtr: FiltrSablon = {}) {
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

export type SablonaVSeznamu = Awaited<ReturnType<typeof nactiSablony>>[number]

export async function nactiSablonu(id: string) {
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

export type Sablona = NonNullable<Awaited<ReturnType<typeof nactiSablonu>>>

/** Verze od nejnovější. Návrh je vždy nahoře, protože se na něm pracuje. */
export async function nactiVerze(sablonaId: string) {
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

export type VerzeSablony = Awaited<ReturnType<typeof nactiVerze>>[number]

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

export async function nactiUkony(verzeId: string) {
  const supabase = await vytvorServerovehoKlienta()

  const { data, error } = await supabase
    .from('sablona_ukon')
    .select(SLOUPCE_UKONU)
    .eq('sablona_verze_id', verzeId)
    .order('poradi')

  if (error) throw new Error(`Nepodařilo se načíst matici: ${error.message}`)

  return data ?? []
}

export type UkonMatice = Awaited<ReturnType<typeof nactiUkony>>[number]

export async function nactiPrirazenaZarizeni(sablonaId: string) {
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
export async function nactiZarizeniProPrirazeni(oblastId: string) {
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
export async function nactiProfese() {
  const supabase = await vytvorServerovehoKlienta()

  const { data, error } = await supabase.from('role').select('id, kod, nazev').order('poradi')

  if (error) throw new Error(`Nepodařilo se načíst profese: ${error.message}`)

  return data ?? []
}

export type Profese = Awaited<ReturnType<typeof nactiProfese>>[number]
