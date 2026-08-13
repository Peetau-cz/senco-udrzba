'use server'

import { revalidatePath } from 'next/cache'
import { vytvorServerovehoKlienta } from '@/lib/supabase/server'
import { KOD_KORENE } from '@/lib/umisteni/dotazy'
import { kodUmisteni, volnyKod } from '@/lib/umisteni/kod'

export type StavUmisteni = { chyba?: string }

function obnov() {
  revalidatePath('/nastaveni/umisteni')
  // Výběr umístění ve formuláři zařízení čte tentýž číselník.
  revalidatePath('/zarizeni')
}

/**
 * Přidá halu nebo provoz.
 *
 * Kód se odvozuje z názvu, uživatel ho nezadává. Jedinečnost se hlídá dvakrát:
 * tady kvůli srozumitelné hlášce a v databázi omezením `umisteni_kod_key`, které
 * podchytí i souběh dvou lidí zakládajících stejnou halu naráz.
 */
export async function pridejUmisteni(
  nadrazeneId: string | null,
  _predchozi: StavUmisteni,
  formData: FormData,
): Promise<StavUmisteni> {
  const nazev = (formData.get('nazev') as string | null)?.trim() ?? ''

  if (!nazev) return { chyba: 'Zadejte název.' }
  if (nazev.length > 100) return { chyba: 'Název je příliš dlouhý.' }

  const supabase = await vytvorServerovehoKlienta()

  const { data: existujici } = await supabase.from('umisteni').select('kod, nazev, nadrazene_id')

  // Dvě haly téhož jména by v číselníku nikdo nerozeznal. Databáze to nehlídá -
  // jedinečný je jen kód, a ten by se u druhé haly prostě očísloval.
  const stejneJmeno = (existujici ?? []).some(
    (u) => u.nadrazene_id === nadrazeneId && u.nazev.trim().toLowerCase() === nazev.toLowerCase(),
  )
  if (stejneJmeno) return { chyba: `„${nazev}" už tu je.` }

  const kodNadrazeneho = nadrazeneId
    ? ((await supabase.from('umisteni').select('kod').eq('id', nadrazeneId).maybeSingle()).data
        ?.kod ?? null)
    : null

  // Kód kořene se do předpony nedává - všechno je v areálu, takže by `AREAL_`
  // nesl každý kód v číselníku a nic tím neodlišil.
  const predpona = kodNadrazeneho === KOD_KORENE ? null : kodNadrazeneho

  const zaklad = kodUmisteni(nazev, predpona)
  if (!zaklad) return { chyba: 'Z názvu nejde odvodit kód. Použijte písmena nebo číslice.' }

  const kod = volnyKod(
    zaklad,
    (existujici ?? []).map((u) => u.kod),
  )
  if (!kod) return { chyba: 'Nepodařilo se vytvořit jedinečný kód. Zvolte jiný název.' }

  const { error } = await supabase
    .from('umisteni')
    .insert({ kod, nazev, nadrazene_id: nadrazeneId })

  if (error) return { chyba: prelozChybu(error) }

  obnov()
  return {}
}

/**
 * Přejmenuje umístění. Kód zůstává - stejná zásada jako u typů zařízení: je to
 * klíč, přes který se párují importovaná data, a přejmenováním by se rozešel
 * s tím, co má garant v tabulce.
 */
export async function prejmenujUmisteni(
  id: string,
  _predchozi: StavUmisteni,
  formData: FormData,
): Promise<StavUmisteni> {
  const nazev = (formData.get('nazev') as string | null)?.trim() ?? ''

  if (!nazev) return { chyba: 'Zadejte název.' }

  const supabase = await vytvorServerovehoKlienta()
  const { data, error } = await supabase
    .from('umisteni')
    .update({ nazev })
    .eq('id', id)
    .select('id')

  if (error) return { chyba: prelozChybu(error) }

  // Zamítnutý UPDATE nehlásí chybu, jen nezmění řádek.
  if ((data ?? []).length === 0) {
    return { chyba: 'Umístění se nepodařilo přejmenovat — nemáte oprávnění měnit číselníky.' }
  }

  obnov()
  return {}
}

/**
 * Smaže umístění.
 *
 * Tlačítko se nabízí jen u prázdných uzlů - stránka zná počty zařízení i
 * provozů pod nimi. Kdyby to databáze přesto odmítla (někdo mezitím stroj
 * přesunul), stránka se jen překreslí beze změny; cizí klíč s `on delete
 * restrict` z migrace 0001 je poslední slovo.
 */
export async function smazUmisteni(id: string): Promise<void> {
  const supabase = await vytvorServerovehoKlienta()

  await supabase.from('umisteni').delete().eq('id', id)

  obnov()
}

function prelozChybu(chyba: { code?: string; message: string }): string {
  if (chyba.code === '23505') {
    return 'Umístění s tímto kódem už existuje.'
  }
  // 23503 = cizí klíč. Umístění drží buď zařízení, nebo provoz pod ním; obojí má
  // v migraci 0001 nastavené `on delete restrict`, aby se evidence nerozpadla.
  if (chyba.code === '23503') {
    return 'Umístění nejde smazat — jsou v něm zařízení nebo další provozy.'
  }
  if (chyba.code === '42501') {
    return 'Číselníky smí měnit administrátor a vedoucí údržby.'
  }

  return `Uložení selhalo: ${chyba.message}`
}
