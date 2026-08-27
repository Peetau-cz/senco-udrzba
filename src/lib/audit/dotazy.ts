/**
 * Dotazy nad auditním logem.
 *
 * Stejně jako jinde tu není jediná podmínka na roli uživatele. Politika
 * `audit_log_select` (migrace 0001) pouští administrátora, vedoucího údržby
 * a management; komukoli jinému vrátí tentýž dotaz prázdno. Filtr v aplikaci by
 * byl druhá pravda, kterou by nikdo neudržoval (zásada R1).
 *
 * Jména se dotahují zvlášť, ne vnořeným dotazem: `audit_log.uzivatel_id` nemá
 * cizí klíč do `profil` a nemá ho schválně - audit má přežít smazání účtu.
 * PostgREST se tedy nemá přes co vnořit.
 */

import { celeJmeno } from '@/lib/plan/dotazy'
import { rozsahDnu } from '@/lib/audit/filtr'
import { vytvorServerovehoKlienta } from '@/lib/supabase/server'

/** Kolik záznamů na stránku. Audit poroste rychleji než deník, proto se stránkuje. */
export const NA_STRANU = 50

export type Operace = 'INSERT' | 'UPDATE' | 'DELETE'

export type ZaznamAuditu = {
  id: number
  tabulka: string
  zaznam_id: string
  operace: Operace
  stary_stav: Record<string, unknown> | null
  novy_stav: Record<string, unknown> | null
  uzivatel_id: string | null
  cas: string
}

export type FiltrAuditu = {
  tabulka?: string
  uzivatelId?: string
  od?: string
  do?: string
  strana?: number
}

export type StrankaAuditu = {
  zaznamy: ZaznamAuditu[]
  celkem: number
  strana: number
  stran: number
}

export type UzivatelVNabidce = {
  id: string
  jmeno: string
}

/**
 * Stránka auditu podle filtru.
 *
 * Řadí se od nejnovějšího - kdo otevře audit, ptá se skoro vždy „co se stalo
 * teď", ne „co se stalo na začátku".
 */
export async function nactiAudit(filtr: FiltrAuditu = {}): Promise<StrankaAuditu> {
  const supabase = await vytvorServerovehoKlienta()

  const strana = Math.max(1, Math.trunc(filtr.strana ?? 1))
  const zacatek = (strana - 1) * NA_STRANU

  let dotaz = supabase
    .from('audit_log')
    .select('id, tabulka, zaznam_id, operace, stary_stav, novy_stav, uzivatel_id, cas', {
      count: 'exact',
    })
    .order('cas', { ascending: false })
    .order('id', { ascending: false })
    .range(zacatek, zacatek + NA_STRANU - 1)

  if (filtr.tabulka) dotaz = dotaz.eq('tabulka', filtr.tabulka)
  if (filtr.uzivatelId) dotaz = dotaz.eq('uzivatel_id', filtr.uzivatelId)

  const { odIso, doIso } = rozsahDnu(filtr.od, filtr.do)
  if (odIso) dotaz = dotaz.gte('cas', odIso)
  // Ostře: horní mez je začátek následujícího dne, viz lib/audit/filtr.ts.
  if (doIso) dotaz = dotaz.lt('cas', doIso)

  const { data, error, count } = await dotaz

  if (error) throw new Error(`Nepodařilo se načíst auditní log: ${error.message}`)

  const celkem = count ?? 0

  return {
    zaznamy: (data ?? []) as ZaznamAuditu[],
    celkem,
    strana,
    stran: Math.max(1, Math.ceil(celkem / NA_STRANU)),
  }
}

/**
 * Mapa klíč → jméno pro nahrazení identifikátorů v rozdílu.
 *
 * Načítá se jednou pro celou stránku a použije se na všechny záznamy. Tabulky
 * jsou malé (lidé, oblasti, stroje), takže je levnější vzít je celé než se
 * doptávat na jednotlivé klíče u každého řádku zvlášť.
 */
export async function nactiMapuJmen(): Promise<Map<string, string>> {
  const supabase = await vytvorServerovehoKlienta()

  const [lide, oblasti, stroje] = await Promise.all([
    supabase.from('profil').select('id, jmeno, prijmeni, email'),
    supabase.from('oblast').select('id, nazev'),
    supabase.from('zarizeni').select('id, nazev, inventarni_cislo'),
  ])

  if (lide.error) throw new Error(`Nepodařilo se načíst uživatele: ${lide.error.message}`)
  if (oblasti.error) throw new Error(`Nepodařilo se načíst oblasti: ${oblasti.error.message}`)
  if (stroje.error) throw new Error(`Nepodařilo se načíst zařízení: ${stroje.error.message}`)

  const mapa = new Map<string, string>()

  for (const osoba of lide.data ?? []) {
    const jmeno = celeJmeno(osoba)
    if (jmeno) mapa.set(osoba.id, jmeno)
  }

  for (const oblast of oblasti.data ?? []) {
    mapa.set(oblast.id, oblast.nazev)
  }

  for (const stroj of stroje.data ?? []) {
    mapa.set(
      stroj.id,
      stroj.inventarni_cislo ? `${stroj.nazev} (${stroj.inventarni_cislo})` : stroj.nazev,
    )
  }

  return mapa
}

/** Lidé do filtru „kdo změnu provedl". */
export async function nactiUzivateleProFiltr(): Promise<UzivatelVNabidce[]> {
  const supabase = await vytvorServerovehoKlienta()

  const { data, error } = await supabase
    .from('profil')
    .select('id, jmeno, prijmeni, email')
    .order('prijmeni')

  if (error) throw new Error(`Nepodařilo se načíst uživatele: ${error.message}`)

  return (data ?? [])
    .map((osoba) => ({ id: osoba.id, jmeno: celeJmeno(osoba) }))
    .filter((osoba) => osoba.jmeno !== '')
}
