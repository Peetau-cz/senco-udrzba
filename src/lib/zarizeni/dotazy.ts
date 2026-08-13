/**
 * Dotazy nad evidencí zařízení.
 *
 * Nikde tu není podmínka na oblast uživatele - a je to záměr. Politika
 * `zarizeni_select` volá ma_pristup_k_oblasti(), takže specialista CNC dostane
 * ze stejného dotazu jen své stroje. Kdyby se filtr psal i tady, vznikla by
 * druhá pravda, kterou by nikdo neudržoval (zásada R1).
 */

import { vytvorServerovehoKlienta } from '@/lib/supabase/server'
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
  umisteni (id, nazev),
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

/** Číselníky pro formulář i filtry. Vše prochází RLS, takže cizí oblast nenabídne. */
export async function nactiCiselniky() {
  const supabase = await vytvorServerovehoKlienta()

  const [typy, umisteni, osoby] = await Promise.all([
    supabase
      .from('typ_zarizeni')
      .select('id, kod, nazev, oblast_id, schema_parametru')
      .eq('aktivni', true)
      .order('nazev'),
    supabase.from('umisteni').select('id, kod, nazev').order('nazev'),
    supabase
      .from('profil')
      .select('id, jmeno, prijmeni, email')
      .eq('aktivni', true)
      .order('prijmeni'),
  ])

  return {
    typy: typy.data ?? [],
    umisteni: umisteni.data ?? [],
    osoby: (osoby.data ?? []).map((o) => ({
      id: o.id,
      jmeno: [o.jmeno, o.prijmeni].filter(Boolean).join(' ').trim() || o.email,
    })),
  }
}
