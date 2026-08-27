'use server'

import { revalidatePath } from 'next/cache'
import { kodDruhu, MAX_DELKA_POPISU } from '@/lib/denik/zasah'
import { vytvorServerovehoKlienta } from '@/lib/supabase/server'

export type StavDruhu = { chyba?: string }

function obnov() {
  revalidatePath('/nastaveni/druhy-zasahu')
  // Formulář zásahu čte tentýž číselník.
  revalidatePath('/denik')
  revalidatePath('/denik/novy')
}

/**
 * Přidá druh zásahu.
 *
 * Kód se odvozuje z názvu, uživatel ho nezadává. Jedinečnost se hlídá dvakrát:
 * tady kvůli srozumitelné hlášce a v databázi omezením `druh_zasahu_kod_key`,
 * které podchytí i souběh dvou lidí zakládajících stejný druh naráz.
 */
export async function pridejDruh(
  _predchozi: StavDruhu,
  formData: FormData,
): Promise<StavDruhu> {
  const nazev = (formData.get('nazev') as string | null)?.trim() ?? ''

  if (!nazev) return { chyba: 'Zadejte název.' }
  if (nazev.length > 100) return { chyba: 'Název je příliš dlouhý.' }

  const supabase = await vytvorServerovehoKlienta()
  const { data: existujici } = await supabase.from('druh_zasahu').select('kod, nazev, poradi')

  const stejneJmeno = (existujici ?? []).some(
    (d) => d.nazev.trim().toLowerCase() === nazev.toLowerCase(),
  )
  if (stejneJmeno) return { chyba: `„${nazev}" už v číselníku je.` }

  const kod = kodDruhu(
    nazev,
    (existujici ?? []).map((d) => d.kod),
  )
  if (!kod) return { chyba: 'Z názvu nejde odvodit kód. Použijte písmena nebo číslice.' }

  // Nový druh jde na konec seznamu; šest ze zadání si drží pořadí 1-6.
  const dalsiPoradi = Math.max(0, ...(existujici ?? []).map((d) => d.poradi)) + 1

  const { error } = await supabase
    .from('druh_zasahu')
    .insert({ kod, nazev, poradi: dalsiPoradi })

  if (error) return { chyba: prelozChybu(error) }

  obnov()
  return {}
}

/**
 * Přejmenuje druh. Kód zůstává - je to klíč, přes který se druh páruje
 * v seedech a v případném importu, a přejmenováním by se rozešel.
 *
 * Přejmenování se propíše i do starých zápisů, a to je správně: zápisy odkazují
 * na druh, ne na jeho tehdejší název. Kdyby se měl název u historie zamrazit,
 * byl by to snapshot jako u zakázek - tady ale jde o překlep v číselníku,
 * ne o obsah, podle kterého někdo pracoval.
 */
export async function prejmenujDruh(
  id: string,
  _predchozi: StavDruhu,
  formData: FormData,
): Promise<StavDruhu> {
  const nazev = (formData.get('nazev') as string | null)?.trim() ?? ''

  if (!nazev) return { chyba: 'Zadejte název.' }
  if (nazev.length > MAX_DELKA_POPISU) return { chyba: 'Název je příliš dlouhý.' }

  const supabase = await vytvorServerovehoKlienta()
  const { data, error } = await supabase
    .from('druh_zasahu')
    .update({ nazev })
    .eq('id', id)
    .select('id')

  if (error) return { chyba: prelozChybu(error) }

  // Zamítnutý UPDATE nehlásí chybu, jen nezmění řádek.
  if ((data ?? []).length === 0) {
    return { chyba: 'Druh se nepodařilo přejmenovat — nemáte oprávnění měnit číselníky.' }
  }

  obnov()
  return {}
}

/**
 * Vyřadí druh z nabídky, nebo ho vrátí zpátky.
 *
 * Mazat se dá jen druh, který nikdo nepoužil (drží ho cizí klíč s `on delete
 * restrict`). Proto tohle: druh, který se přestal dělat, zmizí z formuláře,
 * ale zápisy v historii o svůj název nepřijdou.
 */
export async function prepniAktivituDruhu(id: string, aktivni: boolean): Promise<void> {
  const supabase = await vytvorServerovehoKlienta()

  await supabase.from('druh_zasahu').update({ aktivni }).eq('id', id)

  obnov()
}

/**
 * Smaže druh. Nabízí se jen u nepoužitých - stránka počty zápisů zná. Kdyby to
 * databáze přesto odmítla (někdo mezitím zapsal zásah), stránka se překreslí
 * beze změny; cizí klíč z migrace 0020 je poslední slovo.
 */
export async function smazDruh(id: string): Promise<void> {
  const supabase = await vytvorServerovehoKlienta()

  await supabase.from('druh_zasahu').delete().eq('id', id)

  obnov()
}

function prelozChybu(chyba: { code?: string; message: string }): string {
  if (chyba.code === '23505') return 'Druh s tímto kódem už v číselníku je.'
  if (chyba.code === '23503') return 'Druh nejde smazat — jsou na něj navázané zápisy v deníku.'
  if (chyba.code === '42501') return 'Číselníky smí měnit administrátor a vedoucí údržby.'

  return `Uložení selhalo: ${chyba.message}`
}
