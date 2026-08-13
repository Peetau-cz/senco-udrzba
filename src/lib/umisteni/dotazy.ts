/**
 * Strom umístění.
 *
 * Tabulka `umisteni` je plochá a hierarchii drží sloupcem `nadrazene_id`, který
 * ukazuje na jiný řádek téže tabulky. Strom se proto skládá až tady, v jednom
 * průchodu - dotazovat databázi rekurzivně by se u desítek hal nevyplatilo.
 *
 * Politika `umisteni_select` z migrace 0001 pouští čtení všem přihlášeným:
 * umístění je provozní údaj, ne tajemství. Zapisovat smí správci číselníků.
 */

import { vytvorServerovehoKlienta } from '@/lib/supabase/server'
import { KOD_KORENE } from '@/lib/umisteni/zobrazeni'

export { KOD_KORENE }

export type UzelUmisteni = {
  id: string
  kod: string
  nazev: string
  nadrazene_id: string | null
  pocetZarizeni: number
  deti: UzelUmisteni[]
}

export async function nactiStromUmisteni() {
  const supabase = await vytvorServerovehoKlienta()

  const { data, error } = await supabase
    .from('umisteni')
    .select('id, kod, nazev, nadrazene_id, zarizeni (count)')
    .order('nazev')

  if (error) throw new Error(`Nepodařilo se načíst umístění: ${error.message}`)

  const uzly = new Map<string, UzelUmisteni>()

  for (const radek of data ?? []) {
    uzly.set(radek.id, {
      id: radek.id,
      kod: radek.kod,
      nazev: radek.nazev,
      nadrazene_id: radek.nadrazene_id,
      pocetZarizeni: radek.zarizeni?.[0]?.count ?? 0,
      deti: [],
    })
  }

  const koreny: UzelUmisteni[] = []

  for (const uzel of uzly.values()) {
    const rodic = uzel.nadrazene_id ? uzly.get(uzel.nadrazene_id) : undefined
    if (rodic) rodic.deti.push(uzel)
    else koreny.push(uzel)
  }

  const koren = koreny.find((u) => u.kod === KOD_KORENE) ?? null

  return {
    koren,
    /** Haly: potomci areálu. Bez kořene se za haly berou uzly bez nadřazeného. */
    haly: koren ? koren.deti : koreny,
    vsechny: [...uzly.values()],
  }
}

export type NabidkaUmisteni = {
  koren: { id: string; nazev: string } | null
  haly: {
    id: string
    nazev: string
    provozy: { id: string; nazev: string }[]
  }[]
}

/**
 * Umístění pro výběr ve formuláři zařízení.
 *
 * Plochý seznam by u víc hal nedával smysl - „CNC" a „Elektro" by v něm stály
 * vedle sebe bez informace, ve které hale jsou. Nabídka proto drží strukturu:
 * hala je skupina, provozy jsou její položky a vybrat jde obojí, protože stroj
 * může stát i v hale bez zařazení do provozu.
 */
export async function nactiNabidkuUmisteni(): Promise<NabidkaUmisteni> {
  const { koren, haly } = await nactiStromUmisteni()

  return {
    koren: koren ? { id: koren.id, nazev: koren.nazev } : null,
    haly: haly.map((hala) => ({
      id: hala.id,
      nazev: hala.nazev,
      provozy: hala.deti.map((provoz) => ({ id: provoz.id, nazev: provoz.nazev })),
    })),
  }
}
