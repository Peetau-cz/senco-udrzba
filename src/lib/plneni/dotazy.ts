/**
 * Dotazy nad plněním matice a podklady pro dashboard.
 *
 * Čte se z pohledů z migrace 0018, ne z tabulek. Výpočet plnění má být na
 * jednom místě: dashboard, obrazovka plnění i export do XLSX musí ukázat totéž
 * číslo. Kdyby si každá obrazovka počítala svoje, rozejdou se dřív nebo později.
 *
 * Podmínka na oblast uživatele tu není - pohledy jsou `security_invoker`, takže
 * politiky pod nimi platí dál a specialista CNC dostane ze stejného dotazu jen
 * svou oblast (zásada R1).
 */

import { vytvorServerovehoKlienta } from '@/lib/supabase/server'
import type { RadekPlneni } from '@/lib/plneni/vypocet'

/**
 * Plnění po oblastech za jedno období.
 *
 * Oblasti se doplňují všechny, i ty bez jediné zakázky - prázdný řádek říká
 * „nic tu nebylo naplánované", kdežto chybějící řádek by vypadal, jako by
 * oblast neexistovala. V měsíci, kdy se evidence teprve rozjíždí, je to rozdíl.
 */
export async function nactiPlneni(obdobi: string): Promise<RadekPlneni[]> {
  const supabase = await vytvorServerovehoKlienta()

  const [oblasti, plneni] = await Promise.all([
    supabase.from('oblast').select('id, nazev').eq('aktivni', true).order('poradi'),
    supabase
      .from('v_plneni_matice')
      .select('oblast_id, celkem, splneno, po_terminu, neprovedeno')
      .eq('obdobi', obdobi),
  ])

  if (oblasti.error) throw new Error(`Nepodařilo se načíst oblasti: ${oblasti.error.message}`)
  if (plneni.error) throw new Error(`Nepodařilo se načíst plnění: ${plneni.error.message}`)

  const podleOblasti = new Map((plneni.data ?? []).map((r) => [r.oblast_id, r]))

  return (oblasti.data ?? []).map((o) => {
    const radek = podleOblasti.get(o.id)

    return {
      oblastId: o.id,
      oblastNazev: o.nazev,
      celkem: radek?.celkem ?? 0,
      splneno: radek?.splneno ?? 0,
      poTerminu: radek?.po_terminu ?? 0,
      neprovedeno: radek?.neprovedeno ?? 0,
    }
  })
}

export async function nactiDnesniPlan(limit = 50) {
  const supabase = await vytvorServerovehoKlienta()

  const { data, error } = await supabase
    .from('v_dnesni_plan')
    .select('*')
    .order('zarizeni_nazev')
    .limit(limit)

  if (error) throw new Error(`Nepodařilo se načíst dnešní plán: ${error.message}`)

  return data ?? []
}

export async function nactiPoTerminu(limit = 50, oblastId?: string) {
  const supabase = await vytvorServerovehoKlienta()

  // Nejhorší nahoře: kdo se dívá na restance, řeší nejdřív to, co čeká nejdéle.
  let dotaz = supabase
    .from('v_po_terminu')
    .select('*')
    .order('dnu_zpozdeni', { ascending: false })
    .limit(limit)

  if (oblastId) dotaz = dotaz.eq('oblast_id', oblastId)

  const { data, error } = await dotaz

  if (error) throw new Error(`Nepodařilo se načíst zakázky po termínu: ${error.message}`)

  return data ?? []
}

export type ZakazkaPoTerminu = Awaited<ReturnType<typeof nactiPoTerminu>>[number]
export type ZakazkaDnes = Awaited<ReturnType<typeof nactiDnesniPlan>>[number]

/** Poslední dokončené údržby. Podklad pro kartu „poslední provedené". */
export async function nactiPosledniProvedene(limit = 5) {
  const supabase = await vytvorServerovehoKlienta()

  const { data, error } = await supabase
    .from('zakazka')
    .select(
      `
      id, dokonceno_at, planovany_termin,
      zarizeni (id, nazev, inventarni_cislo, oblast_id),
      dokoncil:dokoncil_id (id, jmeno, prijmeni, email)
    `,
    )
    .eq('stav', 'dokonceno')
    .order('dokonceno_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(`Nepodařilo se načíst poslední údržby: ${error.message}`)

  return data ?? []
}

/**
 * Rozdělané zakázky oblasti za období — podklad pro rozklik plnění.
 *
 * Bere se z tabulky, ne z pohledu: pohled plnění je agregát a tady je potřeba
 * jednotlivá zakázka i s tím, kolik kroků v ní zbývá.
 */
export async function nactiNesplneneVObdobi(oblastId: string, obdobi: string) {
  const supabase = await vytvorServerovehoKlienta()

  const konec = konecMesice(obdobi)

  const { data, error } = await supabase
    .from('zakazka')
    .select(
      `
      id, planovany_termin, stav,
      zarizeni (id, nazev, inventarni_cislo, oblast_id),
      profese:profese_role_id (id, nazev),
      zakazka_ukon (stav)
    `,
    )
    .gte('planovany_termin', obdobi)
    .lte('planovany_termin', konec)
    .neq('stav', 'zruseno')
    .order('planovany_termin')

  if (error) throw new Error(`Nepodařilo se načíst zakázky oblasti: ${error.message}`)

  // Oblast se filtruje až tady: je to vnořený sloupec přes zařízení a takový
  // filtr by PostgREST musel řešit vnitřním spojením, které mění tvar dotazu.
  return (data ?? []).filter((z) => z.zarizeni?.oblast_id === oblastId)
}

/** Poslední den měsíce, ve kterém leží dané období. */
function konecMesice(obdobi: string): string {
  const [rok = 0, mesic = 1] = obdobi.split('-').map(Number)
  // Nultý den následujícího měsíce je poslední den toho současného.
  return new Date(Date.UTC(rok, mesic, 0)).toISOString().slice(0, 10)
}
