/**
 * Dotazy nad plánem údržby a zakázkami.
 *
 * Stejně jako u zařízení a šablon tu není podmínka na oblast uživatele -
 * politiky z migrací 0010 a 0011 stojí nad ma_pristup_k_oblasti(), takže
 * specialista CNC dostane ze stejného dotazu jen své stroje. Druhý filtr
 * v kódu by byl druhá pravda, kterou by nikdo neudržoval (zásada R1).
 */

import { NADOBA_ZAKAZEK, odkazyKeStazeni } from '@/lib/storage'
import { vytvorServerovehoKlienta } from '@/lib/supabase/server'
import type { Database } from '@/types/database.types'

type StavZakazky = Database['public']['Enums']['stav_zakazky']

/** Stavy, ve kterých je zakázka rozdělaná. Zrcadlí podmínky v migraci 0013. */
export const OTEVRENE_STAVY: readonly StavZakazky[] = ['naplanovano', 'probiha']

const SLOUPCE_UKONU_MATICE = `
  klic, poradi, nazev, popis, interval_typ, interval_hodnota, interval_zaklad,
  tolerance_dny, vyzaduje_foto, vyzaduje_hodnotu, nabizi_poznamku, jednotka,
  profese:profese_role_id (id, kod, nazev)
` as const

export type RadekPlanu = {
  id: string
  sablonaId: string
  sablonaNazev: string
  ukonKlic: string
  dalsiTermin: string | null
  posledniProvedenoAt: string | null
  aktivni: boolean
  /** Úkon z právě platné matice. Null, když ho tam ta verze už nemá. */
  ukon: {
    poradi: number
    nazev: string
    popis: string | null
    intervalTyp: Database['public']['Enums']['interval_typ']
    intervalHodnota: number
    intervalZaklad: Database['public']['Enums']['interval_zaklad']
    toleranceDny: number
    profese: string | null
  } | null
}

/**
 * Plán jednoho stroje: co se na něm má dělat a kdy.
 *
 * Dva dotazy a spojení v paměti schválně. Plán se na matici neváže cizím
 * klíčem, ale stálým klíčem úkonu (migrace 0010) - PostgREST tedy nemá co
 * vnořit. Řádků jsou jednotky až desítky, takže spojení v paměti nic nestojí
 * a je vidět, podle čeho se páruje.
 */
export async function nactiPlanZarizeni(zarizeniId: string): Promise<RadekPlanu[]> {
  const supabase = await vytvorServerovehoKlienta()

  const { data: plan, error } = await supabase
    .from('plan_udrzby')
    .select('id, sablona_id, ukon_klic, dalsi_termin, posledni_provedeno_at, aktivni')
    .eq('zarizeni_id', zarizeniId)

  if (error) throw new Error(`Nepodařilo se načíst plán údržby: ${error.message}`)
  if (!plan?.length) return []

  const sablony = [...new Set(plan.map((p) => p.sablona_id))]

  const { data: verze, error: chybaVerzi } = await supabase
    .from('sablona_verze')
    .select(`sablona_id, sablona (id, nazev), sablona_ukon (${SLOUPCE_UKONU_MATICE})`)
    .in('sablona_id', sablony)
    .eq('stav', 'aktivni')

  if (chybaVerzi) throw new Error(`Nepodařilo se načíst matici: ${chybaVerzi.message}`)

  const nazvySablon = new Map<string, string>()
  const ukony = new Map<string, RadekPlanu['ukon']>()

  for (const v of verze ?? []) {
    nazvySablon.set(v.sablona_id, v.sablona?.nazev ?? 'bez názvu')

    for (const u of v.sablona_ukon ?? []) {
      ukony.set(`${v.sablona_id}|${u.klic}`, {
        poradi: u.poradi,
        nazev: u.nazev,
        popis: u.popis,
        intervalTyp: u.interval_typ,
        intervalHodnota: u.interval_hodnota,
        intervalZaklad: u.interval_zaklad,
        toleranceDny: u.tolerance_dny,
        profese: u.profese?.nazev ?? null,
      })
    }
  }

  const radky: RadekPlanu[] = plan.map((p) => ({
    id: p.id,
    sablonaId: p.sablona_id,
    sablonaNazev: nazvySablon.get(p.sablona_id) ?? 'bez platné verze',
    ukonKlic: p.ukon_klic,
    dalsiTermin: p.dalsi_termin,
    posledniProvedenoAt: p.posledni_provedeno_at,
    aktivni: p.aktivni,
    ukon: ukony.get(`${p.sablona_id}|${p.ukon_klic}`) ?? null,
  }))

  // Pořadím matice, aby plán četl stejně jako šablona. Vyřazené úkony (bez
  // místa v platné verzi) padají na konec - jsou to zbytky, ne práce.
  return radky.sort((a, b) => {
    if (a.sablonaNazev !== b.sablonaNazev) return a.sablonaNazev.localeCompare(b.sablonaNazev, 'cs')
    if (!a.ukon || !b.ukon) return a.ukon ? -1 : b.ukon ? 1 : 0
    return a.ukon.poradi - b.ukon.poradi
  })
}

export type PohledPlanu = 'otevrene' | 'po_terminu' | 'dokoncene'

export type FiltrZakazek = {
  pohled?: PohledPlanu
  oblastId?: string
  /** Zakázky přiřazené konkrétnímu člověku. */
  uzivatelId?: string
}

const SLOUPCE_ZAKAZKY = `
  id, planovany_termin, stav, zahajeno_at, dokonceno_at,
  zarizeni (id, nazev, inventarni_cislo, oblast_id, oblast (id, kod, nazev)),
  profese:profese_role_id (id, kod, nazev),
  prirazeno:prirazeno_uzivateli_id (id, jmeno, prijmeni, email),
  zakazka_ukon (stav)
` as const

export async function nactiZakazky(filtr: FiltrZakazek = {}, dnes: string) {
  const supabase = await vytvorServerovehoKlienta()

  let dotaz = supabase.from('zakazka').select(SLOUPCE_ZAKAZKY)

  if (filtr.pohled === 'dokoncene') {
    dotaz = dotaz.eq('stav', 'dokonceno').order('dokonceno_at', { ascending: false })
  } else {
    dotaz = dotaz.in('stav', [...OTEVRENE_STAVY]).order('planovany_termin')

    // Po termínu je všechno, co mělo být hotové včera a dřív. Tolerance úkonu
    // se sem schválně nepromítá - ta patří do výpočtu plnění v M4, ne do toho,
    // co technik vidí jako restanci.
    if (filtr.pohled === 'po_terminu') dotaz = dotaz.lt('planovany_termin', dnes)
  }

  if (filtr.uzivatelId) dotaz = dotaz.eq('prirazeno_uzivateli_id', filtr.uzivatelId)

  const { data, error } = await dotaz.limit(500)

  if (error) throw new Error(`Nepodařilo se načíst zakázky: ${error.message}`)

  // Oblast se filtruje až tady: je to vnořený sloupec přes zařízení a takový
  // filtr by PostgREST musel řešit vnitřním spojením, které mění tvar dotazu.
  const radky = filtr.oblastId
    ? (data ?? []).filter((z) => z.zarizeni?.oblast_id === filtr.oblastId)
    : (data ?? [])

  return radky
}

export type ZakazkaVSeznamu = Awaited<ReturnType<typeof nactiZakazky>>[number]

/** Kolik kroků je vyřízených a kolik jich celkem je. */
export function postupZakazky(zakazka: { zakazka_ukon?: { stav: string }[] | null }): {
  hotovo: number
  celkem: number
} {
  const kroky = zakazka.zakazka_ukon ?? []

  return {
    hotovo: kroky.filter((k) => k.stav !== 'nesplneno').length,
    celkem: kroky.length,
  }
}

export function celeJmeno(
  osoba?: { jmeno?: string | null; prijmeni?: string | null; email?: string | null } | null,
): string {
  if (!osoba) return ''

  const jmeno = [osoba.jmeno, osoba.prijmeni].filter(Boolean).join(' ').trim()
  return jmeno || (osoba.email ?? '')
}

export async function nactiZakazku(id: string) {
  const supabase = await vytvorServerovehoKlienta()

  // maybeSingle, ne single: cizí zakázku RLS odfiltruje a dotaz vrátí prázdno.
  // To není chyba, to je odepřený přístup - a ten se má projevit jako 404.
  const { data, error } = await supabase
    .from('zakazka')
    .select(
      `
      id, planovany_termin, stav, zahajeno_at, dokonceno_at, poznamka,
      zarizeni (id, nazev, inventarni_cislo, oblast_id, oblast (id, kod, nazev)),
      verze:sablona_verze_id (id, cislo_verze, sablona (id, nazev)),
      profese:profese_role_id (id, kod, nazev),
      prirazeno:prirazeno_uzivateli_id (id, jmeno, prijmeni, email),
      dokoncil:dokoncil_id (id, jmeno, prijmeni, email)
    `,
    )
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(`Nepodařilo se načíst zakázku: ${error.message}`)

  return data
}

export type Zakazka = NonNullable<Awaited<ReturnType<typeof nactiZakazku>>>

export function jeOtevrena(zakazka: { stav: StavZakazky }): boolean {
  return OTEVRENE_STAVY.includes(zakazka.stav)
}

/**
 * Kroky checklistu i s fotkami.
 *
 * Odkazy na fotky se podepisují jedním voláním pro celou zakázku, ne po krocích -
 * checklist o šestnácti krocích by jinak čekal na šestnáct kol sítě.
 */
export async function nactiKrokyZakazky(zakazkaId: string) {
  const supabase = await vytvorServerovehoKlienta()

  const { data, error } = await supabase
    .from('zakazka_ukon')
    .select(
      `
      id, poradi, nazev_snapshot, popis_snapshot, kontrolni_body,
      vyzaduje_foto, vyzaduje_hodnotu, nabizi_poznamku,
      jednotka_snapshot, mez_min_snapshot, mez_max_snapshot,
      stav, hodnota, poznamka, potvrzeno_at,
      potvrdil:potvrdil_id (id, jmeno, prijmeni, email),
      zakazka_foto (id, storage_path, popis, vytvoreno_at)
    `,
    )
    .eq('zakazka_id', zakazkaId)
    .order('poradi')

  if (error) throw new Error(`Nepodařilo se načíst checklist: ${error.message}`)

  const kroky = data ?? []
  const cesty = kroky.flatMap((k) => (k.zakazka_foto ?? []).map((f) => f.storage_path))
  const odkazy = await odkazyKeStazeni(NADOBA_ZAKAZEK, cesty)

  return kroky.map((k) => ({
    ...k,
    fotky: (k.zakazka_foto ?? [])
      .map((f) => ({ ...f, odkaz: odkazy.get(f.storage_path) ?? null }))
      .sort((a, b) => a.vytvoreno_at.localeCompare(b.vytvoreno_at)),
  }))
}

export type KrokZakazky = Awaited<ReturnType<typeof nactiKrokyZakazky>>[number]
