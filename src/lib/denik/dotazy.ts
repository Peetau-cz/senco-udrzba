/**
 * Dotazy nad provozním deníkem.
 *
 * Stejně jako u evidence zařízení tu není jediná podmínka na oblast uživatele.
 * Politika `provozni_denik_select` volá ma_pristup_k_oblasti(), takže tentýž
 * dotaz vrátí specialistovi CNC jen jeho oblast. Filtr v aplikaci by byl druhá
 * pravda, kterou by nikdo neudržoval (zásada R1).
 */

import { NADOBA_DENIKU, odkazyKeStazeni } from '@/lib/storage'
import { vytvorServerovehoKlienta } from '@/lib/supabase/server'

/**
 * Strop seznamu. Deník poroste donekonečna a stránkování zatím není - dokud
 * nebude, je poctivější vrátit posledních pár set zápisů než tichý půlminutový
 * dotaz. Že se strop dotkl, pozná stránka podle délky výsledku.
 */
export const STROP_SEZNAMU = 300

const SLOUPCE_ZAPISU = `
  id, zarizeni_id, oblast_id, popis, provedeno_at, doba_trvani_min, vytvoreno_at, zapsal_id,
  druh:druh_zasahu (id, kod, nazev),
  provedl:profil!provozni_denik_provedl_id_fkey (id, jmeno, prijmeni),
  zapsal:profil!provozni_denik_zapsal_id_fkey (id, jmeno, prijmeni)
` as const

export type DruhZasahu = {
  id: string
  kod: string
  nazev: string
  poradi: number
  aktivni: boolean
}

export type StrojVNabidce = {
  id: string
  nazev: string
  inventarni_cislo: string | null
  oblast_id: string
}

export type ZapisDeniku = {
  id: string
  zarizeni_id: string
  oblast_id: string
  popis: string
  provedeno_at: string
  doba_trvani_min: number | null
  vytvoreno_at: string
  zapsal_id: string | null
  druh: { id: string; kod: string; nazev: string } | null
  provedl: { id: string; jmeno: string; prijmeni: string } | null
  zapsal: { id: string; jmeno: string; prijmeni: string } | null
  stroj: StrojVNabidce | null
  fotek: number
}

export type FiltrDeniku = {
  oblastId?: string
  zarizeniId?: string
  druhId?: string
  /** Datum od/do včetně, v pražském dni. Prázdné = neomezeno. */
  od?: string
  do?: string
  hledani?: string
}

/**
 * Číselník druhů zásahu.
 *
 * Do formuláře patří jen aktivní druhy, do filtru a výpisů všechny - jinak by
 * u starších zápisů zmizel název druhu, který se mezitím vyřadil.
 */
export async function nactiDruhyZasahu(jenAktivni = false): Promise<DruhZasahu[]> {
  const supabase = await vytvorServerovehoKlienta()

  let dotaz = supabase
    .from('druh_zasahu')
    .select('id, kod, nazev, poradi, aktivni')
    .order('poradi')
    .order('nazev')

  if (jenAktivni) dotaz = dotaz.eq('aktivni', true)

  const { data } = await dotaz
  return data ?? []
}

/** Stroje pro výběr ve formuláři. Vyřazené se nenabízejí - nic se na nich nedělá. */
export async function nactiNabidkuZarizeni(oblastId?: string): Promise<StrojVNabidce[]> {
  const supabase = await vytvorServerovehoKlienta()

  let dotaz = supabase
    .from('zarizeni')
    .select('id, nazev, inventarni_cislo, oblast_id')
    .neq('stav', 'vyrazeno')
    .order('nazev')

  if (oblastId) dotaz = dotaz.eq('oblast_id', oblastId)

  const { data } = await dotaz
  return data ?? []
}

/**
 * Kolik zápisů visí na kterém druhu.
 *
 * Vytahují se jen identifikátory a počítá se v paměti - číselník se otevírá
 * zřídka a je to o jeden dotaz míň než počítání po druzích. Kdyby deník narostl
 * do desítek tisíc řádků, je tohle první místo, které si řekne o agregaci.
 */
export async function pocetZapisuPodleDruhu(): Promise<Map<string, number>> {
  const supabase = await vytvorServerovehoKlienta()
  const { data } = await supabase.from('provozni_denik').select('druh_zasahu_id')

  const pocty = new Map<string, number>()
  for (const radek of data ?? []) {
    pocty.set(radek.druh_zasahu_id, (pocty.get(radek.druh_zasahu_id) ?? 0) + 1)
  }

  return pocty
}

/**
 * Lidé pro pole „kdo zásah provedl".
 *
 * Bez filtru na oblast: politika profil_select pouští jména všem přihlášeným,
 * protože kdo úkon provedl je provozní údaj. Vyřazené účty se nenabízejí -
 * zásah dělal někdo, kdo v podniku je.
 */
export async function nactiLidi(): Promise<{ id: string; jmeno: string; prijmeni: string }[]> {
  const supabase = await vytvorServerovehoKlienta()

  const { data } = await supabase
    .from('profil')
    .select('id, jmeno, prijmeni')
    .eq('aktivni', true)
    .order('prijmeni')
    .order('jmeno')

  return data ?? []
}

export async function nactiZapisyDeniku(filtr: FiltrDeniku): Promise<ZapisDeniku[]> {
  const supabase = await vytvorServerovehoKlienta()

  let dotaz = supabase
    .from('provozni_denik')
    .select(SLOUPCE_ZAPISU)
    .order('provedeno_at', { ascending: false })
    .limit(STROP_SEZNAMU)

  if (filtr.oblastId) dotaz = dotaz.eq('oblast_id', filtr.oblastId)
  if (filtr.zarizeniId) dotaz = dotaz.eq('zarizeni_id', filtr.zarizeniId)
  if (filtr.druhId) dotaz = dotaz.eq('druh_zasahu_id', filtr.druhId)

  // Od půlnoci prvního dne do konce dne posledního. Hranice se počítají
  // v pražském pásmu, protože uživatel je zadává v kalendáři nad hlavou.
  if (filtr.od) dotaz = dotaz.gte('provedeno_at', zacatekDne(filtr.od))
  if (filtr.do) dotaz = dotaz.lt('provedeno_at', zacatekDne(filtr.do, 1))

  const hledani = ocistiHledani(filtr.hledani ?? '')
  if (hledani) dotaz = dotaz.ilike('popis', `%${hledani}%`)

  const { data } = await dotaz
  const zapisy = data ?? []

  if (zapisy.length === 0) return []

  // Stroj se nedotahuje vnořeným výběrem: vazba na zařízení je složený cizí klíč
  // (zarizeni_id + oblast_id z migrace 0020) a zbytek aplikace se přes složené
  // klíče taky nevnořuje - viz plan_udrzby v lib/plan/dotazy.ts.
  const [stroje, fotky] = await Promise.all([
    nactiStrojePodleId([...new Set(zapisy.map((z) => z.zarizeni_id))]),
    pocetFotek(zapisy.map((z) => z.id)),
  ])

  return zapisy.map((zapis) => ({
    ...zapis,
    stroj: stroje.get(zapis.zarizeni_id) ?? null,
    fotek: fotky.get(zapis.id) ?? 0,
  }))
}

export type FotkaZapisu = {
  id: string
  storage_path: string
  odkaz: string | null
}

export type ZapisSDetailem = ZapisDeniku & {
  fotky: FotkaZapisu[]
  /** Smí do zápisu přihlášený sáhnout? Odpovídá databáze, ne aplikace. */
  smiMenit: boolean
}

/**
 * Jeden zápis se vším, co je potřeba k jeho zobrazení i opravě.
 *
 * Na otázku „smím ho ještě měnit" se neodpovídá počítáním hodin v aplikaci.
 * Ptá se funkce muze_menit_zapis_deniku z migrace 0022 - té samé, na které
 * stojí trigger nad tabulkou i politiky nad úložištěm. Druhá pravda by se
 * rozešla hned, jak by se okno změnilo.
 */
export async function nactiZapis(id: string): Promise<ZapisSDetailem | null> {
  const supabase = await vytvorServerovehoKlienta()

  const { data } = await supabase
    .from('provozni_denik')
    .select(SLOUPCE_ZAPISU)
    .eq('id', id)
    .maybeSingle()

  if (!data) return null

  const [stroje, fotky, smiMenit] = await Promise.all([
    nactiStrojePodleId([data.zarizeni_id]),
    nactiFotky(data.id),
    supabase.rpc('muze_menit_zapis_deniku', { p_zaznam: data.id }),
  ])

  return {
    ...data,
    stroj: stroje.get(data.zarizeni_id) ?? null,
    fotky,
    fotek: fotky.length,
    smiMenit: smiMenit.data === true,
  }
}

async function nactiFotky(zapisId: string): Promise<FotkaZapisu[]> {
  const supabase = await vytvorServerovehoKlienta()

  const { data } = await supabase
    .from('denik_foto')
    .select('id, storage_path')
    .eq('zaznam_id', zapisId)
    .order('vytvoreno_at')

  const fotky = data ?? []
  if (fotky.length === 0) return []

  const odkazy = await odkazyKeStazeni(
    NADOBA_DENIKU,
    fotky.map((f) => f.storage_path),
  )

  return fotky.map((fotka) => ({
    ...fotka,
    odkaz: odkazy.get(fotka.storage_path) ?? null,
  }))
}

export type UdalostHistorie = {
  puvod: 'udrzba' | 'denik'
  zaznamId: string
  kdy: string
  nazev: string
  popis: string | null
  provedl: string | null
  zapsal: string | null
  dobaTrvaniMin: number | null
  ukonuCelkem: number | null
  ukonuSplneno: number | null
  ukonuNeprovedeno: number | null
  fotek: number
}

/**
 * Kompletní historie jednoho stroje (zadání ř. 146-154).
 *
 * Obě poloviny - dokončené údržby i zápisy z deníku - slévá pohled
 * v_historie_zarizeni z migrace 0023. Aplikace je nespojuje sama schválně:
 * kdyby to dělala, každá další obrazovka by si to spojení psala po svém.
 *
 * Jména se dotahují zvlášť, protože pohled vede jen identifikátory. Je to jeden
 * dotaz navíc a odpadá s ním join, který by v pohledu obcházel RLS nad profily.
 */
export async function nactiHistoriiZarizeni(
  zarizeniId: string,
  strop = 100,
): Promise<UdalostHistorie[]> {
  const supabase = await vytvorServerovehoKlienta()

  const { data } = await supabase
    .from('v_historie_zarizeni')
    .select('*')
    .eq('zarizeni_id', zarizeniId)
    .order('kdy', { ascending: false })
    .limit(strop)

  const udalosti = data ?? []
  if (udalosti.length === 0) return []

  const jmena = await jmenaPodleId([
    ...new Set(udalosti.flatMap((u) => [u.provedl_id, u.zapsal_id]).filter(Boolean) as string[]),
  ])

  return udalosti.map((u) => ({
    puvod: u.puvod,
    zaznamId: u.zaznam_id,
    kdy: u.kdy,
    nazev: u.nazev,
    popis: u.popis,
    provedl: u.provedl_id ? (jmena.get(u.provedl_id) ?? null) : null,
    zapsal: u.zapsal_id ? (jmena.get(u.zapsal_id) ?? null) : null,
    dobaTrvaniMin: u.doba_trvani_min,
    ukonuCelkem: u.ukonu_celkem,
    ukonuSplneno: u.ukonu_splneno,
    ukonuNeprovedeno: u.ukonu_neprovedeno,
    fotek: u.fotek,
  }))
}

async function jmenaPodleId(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map()

  const supabase = await vytvorServerovehoKlienta()
  const { data } = await supabase.from('profil').select('id, jmeno, prijmeni').in('id', ids)

  return new Map(
    (data ?? []).map((osoba) => [osoba.id, `${osoba.jmeno} ${osoba.prijmeni}`.trim()]),
  )
}

async function nactiStrojePodleId(ids: string[]): Promise<Map<string, StrojVNabidce>> {
  if (ids.length === 0) return new Map()

  const supabase = await vytvorServerovehoKlienta()
  const { data } = await supabase
    .from('zarizeni')
    .select('id, nazev, inventarni_cislo, oblast_id')
    .in('id', ids)

  return new Map((data ?? []).map((stroj) => [stroj.id, stroj]))
}

/** Kolik má který zápis fotek. Stačí ikona v seznamu, obsah se čte až v detailu. */
async function pocetFotek(ids: string[]): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map()

  const supabase = await vytvorServerovehoKlienta()
  const { data } = await supabase.from('denik_foto').select('zaznam_id').in('zaznam_id', ids)

  const pocty = new Map<string, number>()
  for (const radek of data ?? []) {
    pocty.set(radek.zaznam_id, (pocty.get(radek.zaznam_id) ?? 0) + 1)
  }

  return pocty
}

/**
 * Půlnoc pražského dne jako okamžik v ISO. Posun se bere z formátovače, aby
 * seděl i přes přechod na letní čas - stejná úvaha jako v lib/denik/zasah.ts.
 */
function zacatekDne(den: string, plusDnu = 0): string {
  const shoda = /^(\d{4})-(\d{2})-(\d{2})$/.exec(den.trim())
  if (!shoda) return new Date(0).toISOString()

  const cislo = (poradi: number) => Number(shoda[poradi])
  const pulnoc = new Date(Date.UTC(cislo(1), cislo(2) - 1, cislo(3) + plusDnu))

  const posun = posunPrahyMin(pulnoc)
  return new Date(pulnoc.getTime() - posun * 60_000).toISOString()
}

function posunPrahyMin(okamzik: Date): number {
  const casti = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Prague',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(okamzik)

  const cast = (typ: string) => Number(casti.find((p) => p.type === typ)?.value ?? '0')

  const mistni = Date.UTC(
    cast('year'),
    cast('month') - 1,
    cast('day'),
    cast('hour'),
    cast('minute'),
  )

  return Math.round((mistni - okamzik.getTime()) / 60_000)
}

/** Hledaný text jde do vzoru pro ILIKE, kde `%` a `_` mají vlastní význam. */
function ocistiHledani(text: string): string {
  return text
    .replace(/[%_\\]/g, ' ')
    .trim()
    .slice(0, 80)
}
