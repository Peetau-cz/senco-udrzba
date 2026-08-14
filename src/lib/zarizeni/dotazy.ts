/**
 * Dotazy nad evidencí zařízení.
 *
 * Nikde tu není podmínka na oblast uživatele - a je to záměr. Politika
 * `zarizeni_select` volá ma_pristup_k_oblasti(), takže specialista CNC dostane
 * ze stejného dotazu jen své stroje. Kdyby se filtr psal i tady, vznikla by
 * druhá pravda, kterou by nikdo neudržoval (zásada R1).
 */

import { odkazyKeStazeni } from '@/lib/storage'
import { vytvorServerovehoKlienta } from '@/lib/supabase/server'
import { nactiNabidkuUmisteni } from '@/lib/umisteni/dotazy'
import { STAVY_ZARIZENI, type StavZarizeni } from '@/lib/zarizeni/formular'

/** Stav přichází z adresy, kde může být cokoli. Neznámý se prostě nefiltruje. */
function jeStav(hodnota: string): hodnota is StavZarizeni {
  return STAVY_ZARIZENI.some((s) => s.hodnota === hodnota)
}

// Nadřazené umístění se tahá i do seznamu: samotné „CNC" nebo „Linka B" neřekne,
// ve které hale to je - a když se teď dá podle haly filtrovat, musí být ve
// výsledku vidět, proč tam řádek je.
const SLOUPCE_SEZNAMU = `
  id, nazev, inventarni_cislo, stav, vyrobce, model, rok_vyroby,
  typ:typ_zarizeni (id, kod, nazev),
  oblast (id, kod, nazev),
  umisteni (id, nazev, nadrazene:nadrazene_id (nazev, kod))
` as const

const SLOUPCE_KARTY = `
  id, nazev, inventarni_cislo, stav, vyrobce, model, vyrobni_cislo, rok_vyroby,
  parametry, poznamka, vytvoreno_at, zmeneno_at,
  oblast_id, typ_zarizeni_id, umisteni_id, odpovedna_osoba_id,
  typ:typ_zarizeni (id, kod, nazev, schema_parametru),
  oblast (id, kod, nazev),
  umisteni (id, kod, nazev, nadrazene:nadrazene_id (nazev, kod)),
  odpovedny:profil (id, jmeno, prijmeni, email)
` as const

/**
 * Filtr přebírá identifikátory, ne kódy. Kód z adresy (`?oblast=cnc`) na id
 * překládá stránka - ta má po ruce číselníky i oblasti přihlášeného.
 */
export type FiltrZarizeni = {
  oblastId?: string
  typId?: string
  stav?: string
  /** Hledá se i ve výrobci a modelu - v seznamu stojí pod názvem, takže je
   *  uživatel bere jako součást téhož sloupce. */
  nazev?: string
  inventarniCislo?: string
  /** Hala se rozpadá na sebe a své provozy, viz `idsUmisteniProFiltr`. */
  umisteniIds?: string[]
}

/**
 * Hledaný text jde do parametru `or`, který má vlastní syntaxi - čárka odděluje
 * podmínky, závorky je seskupují a hvězdička je zástupný znak. Bez očištění by
 * si uživatel mohl dotaz přepsat po svém.
 */
function ocistiHledani(text: string): string {
  return text
    .replace(/[,()*%\\]/g, ' ')
    .trim()
    .slice(0, 80)
}

export async function nactiSeznamZarizeni(filtr: FiltrZarizeni) {
  const supabase = await vytvorServerovehoKlienta()

  let dotaz = supabase.from('zarizeni').select(SLOUPCE_SEZNAMU).order('nazev')

  if (filtr.oblastId) dotaz = dotaz.eq('oblast_id', filtr.oblastId)
  if (filtr.typId) dotaz = dotaz.eq('typ_zarizeni_id', filtr.typId)
  if (filtr.stav && jeStav(filtr.stav)) dotaz = dotaz.eq('stav', filtr.stav)
  if (filtr.umisteniIds?.length) dotaz = dotaz.in('umisteni_id', filtr.umisteniIds)

  // Filtry se skládají a platí zároveň: „Mazak" v názvu a „12" v inventárním
  // čísle vrátí jen stroje, které splní obojí. Uvnitř jednoho sloupce se hledá
  // kdekoli v textu (`%text%`), aby stačil útržek - obsluha si celý název
  // stroje nepamatuje, pamatuje si kus.
  const nazev = filtr.nazev ? ocistiHledani(filtr.nazev) : ''
  if (nazev) {
    dotaz = dotaz.or(`nazev.ilike.%${nazev}%,vyrobce.ilike.%${nazev}%,model.ilike.%${nazev}%`)
  }

  const inventarniCislo = filtr.inventarniCislo ? ocistiHledani(filtr.inventarniCislo) : ''
  if (inventarniCislo) dotaz = dotaz.ilike('inventarni_cislo', `%${inventarniCislo}%`)

  const { data, error } = await dotaz

  if (error) throw new Error(`Nepodařilo se načíst zařízení: ${error.message}`)

  return data ?? []
}

export async function nactiZarizeni(id: string) {
  const supabase = await vytvorServerovehoKlienta()

  // maybeSingle, ne single: cizí zařízení RLS odfiltruje a dotaz vrátí prázdno.
  // To není chyba, to je odepřený přístup - a ten se má projevit jako 404.
  const { data, error } = await supabase
    .from('zarizeni')
    .select(SLOUPCE_KARTY)
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(`Nepodařilo se načíst zařízení: ${error.message}`)

  return data
}

const SLOUPCE_TYPU = `
  id, kod, nazev, popis, aktivni, oblast_id, schema_parametru, vytvoreno_at, zmeneno_at,
  oblast (id, kod, nazev),
  zarizeni (count)
` as const

export async function nactiTypy() {
  const supabase = await vytvorServerovehoKlienta()

  const { data, error } = await supabase.from('typ_zarizeni').select(SLOUPCE_TYPU).order('nazev')

  if (error) throw new Error(`Nepodařilo se načíst typy zařízení: ${error.message}`)

  return data ?? []
}

export async function nactiTyp(id: string) {
  const supabase = await vytvorServerovehoKlienta()

  const { data, error } = await supabase
    .from('typ_zarizeni')
    .select(SLOUPCE_TYPU)
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(`Nepodařilo se načíst typ zařízení: ${error.message}`)

  return data
}

export type TypZarizeni = NonNullable<Awaited<ReturnType<typeof nactiTyp>>>

/** Vnořený součet chodí jako pole s jedním prvkem, ne jako číslo. */
export function pocetZarizeni(typ: { zarizeni?: { count: number }[] | null }): number {
  return typ.zarizeni?.[0]?.count ?? 0
}

/**
 * Soubory ke kartě zařízení i s dočasnými odkazy ke stažení.
 *
 * Nádoba je neveřejná, takže se ke každému souboru vydává podepsaný odkaz.
 * Jak se podepisuje, ví `lib/storage` - sem to nepatří (PORTABILITA pravidlo 5).
 */
export async function nactiSouboryZarizeni(zarizeniId: string) {
  const supabase = await vytvorServerovehoKlienta()

  const { data, error } = await supabase
    .from('zarizeni_soubor')
    .select(
      'id, druh, nazev, cesta, mime, velikost_b, vytvoreno_at, nahral:profil (jmeno, prijmeni, email)',
    )
    .eq('zarizeni_id', zarizeniId)
    .order('vytvoreno_at', { ascending: false })

  if (error) throw new Error(`Nepodařilo se načíst soubory: ${error.message}`)

  const radky = data ?? []
  if (radky.length === 0) return []

  const odkazy = await odkazyKeStazeni(radky.map((r) => r.cesta))

  return radky.map((radek) => ({
    ...radek,
    odkaz: odkazy.get(radek.cesta) ?? null,
  }))
}

export type SouborZarizeni = Awaited<ReturnType<typeof nactiSouboryZarizeni>>[number]

/** Číselníky pro formulář i filtry. Vše prochází RLS, takže cizí oblast nenabídne. */
export async function nactiCiselniky() {
  const supabase = await vytvorServerovehoKlienta()

  const [typy, umisteni, osoby] = await Promise.all([
    supabase
      .from('typ_zarizeni')
      .select('id, kod, nazev, oblast_id, schema_parametru')
      .eq('aktivni', true)
      .order('nazev'),
    nactiNabidkuUmisteni(),
    supabase
      .from('profil')
      .select('id, jmeno, prijmeni, email')
      .eq('aktivni', true)
      .order('prijmeni'),
  ])

  return {
    typy: typy.data ?? [],
    umisteni,
    osoby: (osoby.data ?? []).map((o) => ({
      id: o.id,
      jmeno: [o.jmeno, o.prijmeni].filter(Boolean).join(' ').trim() || o.email,
    })),
  }
}
