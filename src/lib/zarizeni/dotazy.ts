/**
 * Dotazy nad evidencí zařízení.
 *
 * Nikde tu není podmínka na oblast uživatele - a je to záměr. Politika
 * `zarizeni_select` volá ma_pristup_k_oblasti(), takže specialista CNC dostane
 * ze stejného dotazu jen své stroje. Kdyby se filtr psal i tady, vznikla by
 * druhá pravda, kterou by nikdo neudržoval (zásada R1).
 */

import { vytvorServerovehoKlienta } from '@/lib/supabase/server'
import { nactiNabidkuUmisteni } from '@/lib/umisteni/dotazy'
import { STAVY_ZARIZENI, type StavZarizeni } from '@/lib/zarizeni/formular'

/** Stav přichází z adresy, kde může být cokoli. Neznámý se prostě nefiltruje. */
function jeStav(hodnota: string): hodnota is StavZarizeni {
  return STAVY_ZARIZENI.some((s) => s.hodnota === hodnota)
}

const SLOUPCE_SEZNAMU = `
  id, nazev, inventarni_cislo, stav, vyrobce, model, rok_vyroby,
  typ:typ_zarizeni (id, kod, nazev),
  oblast (id, kod, nazev),
  umisteni (id, nazev)
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
  hledani?: string
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

  const hledani = filtr.hledani ? ocistiHledani(filtr.hledani) : ''
  if (hledani) {
    dotaz = dotaz.or(`nazev.ilike.%${hledani}%,inventarni_cislo.ilike.%${hledani}%`)
  }

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

/** Nádoba v Supabase Storage. Vzniká v migraci 0004 a je neveřejná. */
export const NADOBA_SOUBORU = 'zarizeni'

/**
 * Jak dlouho platí odkaz na soubor. Hodina bohatě stačí na otevření návodu i na
 * jeho stažení do tabletu, a přitom se odkaz nedá donekonečna přeposílat dál.
 */
const PLATNOST_ODKAZU_S = 3600

/**
 * Soubory ke kartě zařízení i s dočasnými odkazy ke stažení.
 *
 * Nádoba je neveřejná, takže se ke každému souboru vydává podepsaný odkaz.
 * Podepisuje se jedním voláním pro všechny soubory najednou - kdyby se volalo
 * v cyklu, karta s deseti přílohami by čekala na deset kol sítě.
 */
export async function nactiSouboryZarizeni(zarizeniId: string) {
  const supabase = await vytvorServerovehoKlienta()

  const { data, error } = await supabase
    .from('zarizeni_soubor')
    .select('id, druh, nazev, cesta, mime, velikost_b, vytvoreno_at, nahral:profil (jmeno, prijmeni, email)')
    .eq('zarizeni_id', zarizeniId)
    .order('vytvoreno_at', { ascending: false })

  if (error) throw new Error(`Nepodařilo se načíst soubory: ${error.message}`)

  const radky = data ?? []
  if (radky.length === 0) return []

  const { data: odkazy } = await supabase.storage
    .from(NADOBA_SOUBORU)
    .createSignedUrls(
      radky.map((r) => r.cesta),
      PLATNOST_ODKAZU_S,
    )

  const podleCesty = new Map((odkazy ?? []).map((o) => [o.path, o.signedUrl]))

  return radky.map((radek) => ({
    ...radek,
    // Když se odkaz nepodaří podepsat, soubor se v seznamu pořád ukáže - jen
    // bez možnosti otevřít. Lepší než celá karta se zprávou o chybě.
    odkaz: podleCesty.get(radek.cesta) ?? null,
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
