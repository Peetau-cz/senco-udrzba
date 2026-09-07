'use server'

import { revalidatePath } from 'next/cache'
import { odvozKod, volnyKod } from '@/lib/ciselniky/kod'
import { nactiObsazeneOblasti } from '@/lib/oblasti/dotazy'
import { overNazevOblasti } from '@/lib/oblasti/oblast'
import { vytvorServerovehoKlienta } from '@/lib/supabase/server'

export type StavOblasti = { chyba?: string }

function obnov() {
  revalidatePath('/nastaveni/oblasti')
  // Oblast je nabídka na kartě osoby i ve filtrech zařízení a šablon.
  revalidatePath('/nastaveni/uzivatele')
  revalidatePath('/zarizeni')
  revalidatePath('/sablony')
}

/**
 * Přidá oblast údržby.
 *
 * Kód se odvozuje z názvu, uživatel ho nezadává. Jedinečnost se hlídá dvakrát:
 * tady kvůli srozumitelné hlášce a v databázi omezením `oblast_kod_key`, které
 * podchytí i souběh dvou lidí zakládajících stejnou oblast naráz.
 */
export async function pridejOblast(
  _predchozi: StavOblasti,
  formData: FormData,
): Promise<StavOblasti> {
  const nazev = (formData.get('nazev') as string | null)?.trim() ?? ''

  const chybaNazvu = overNazevOblasti(nazev)
  if (chybaNazvu) return { chyba: chybaNazvu }

  const supabase = await vytvorServerovehoKlienta()
  const { kody, nazvy, posledniPoradi } = await nactiObsazeneOblasti()

  const stejneJmeno = nazvy.some((n) => n.trim().toLowerCase() === nazev.toLowerCase())
  if (stejneJmeno) return { chyba: `„${nazev}“ už v číselníku je.` }

  const kod = volnyKod(odvozKod(nazev), kody)
  if (!kod) return { chyba: 'Z názvu nejde odvodit kód. Použijte písmena nebo číslice.' }

  // Nová oblast jde na konec seznamu; pět ze zadání si drží pořadí 1-5.
  const { error } = await supabase.from('oblast').insert({ kod, nazev, poradi: posledniPoradi + 1 })

  if (error) return { chyba: prelozChybu(error) }

  obnov()
  return {}
}

/**
 * Přejmenuje oblast. Kód zůstává - je to klíč, přes který se oblast páruje
 * v seedu (`supabase/seed.sql`) a v případném importu, a přejmenováním by se
 * rozešel. Nová jména se propíšou i do starých zařízení, a to je správně:
 * zařízení odkazuje na oblast, ne na její tehdejší název.
 */
export async function prejmenujOblast(
  id: string,
  _predchozi: StavOblasti,
  formData: FormData,
): Promise<StavOblasti> {
  const nazev = (formData.get('nazev') as string | null)?.trim() ?? ''

  const chybaNazvu = overNazevOblasti(nazev)
  if (chybaNazvu) return { chyba: chybaNazvu }

  const supabase = await vytvorServerovehoKlienta()
  const { data, error } = await supabase.from('oblast').update({ nazev }).eq('id', id).select('id')

  if (error) return { chyba: prelozChybu(error) }

  // Zamítnutý UPDATE nehlásí chybu, jen nezmění řádek.
  if ((data ?? []).length === 0) {
    return { chyba: 'Oblast se nepodařilo přejmenovat — nemáte oprávnění měnit číselníky.' }
  }

  obnov()
  return {}
}

/**
 * Vyřadí oblast z nabídky, nebo ji vrátí zpátky.
 *
 * Oblast, na které visí zařízení nebo šablony, smazat nejde (cizí klíče
 * s `on delete restrict`) - a nemá: historie by přišla o zařazení. Tohle je
 * způsob, jak oblast, která se přestala provozovat, dostat z nabídek a nechat
 * ji u starých záznamů.
 */
export async function prepniAktivituOblasti(id: string, aktivni: boolean): Promise<void> {
  const supabase = await vytvorServerovehoKlienta()

  await supabase.from('oblast').update({ aktivni }).eq('id', id)

  obnov()
}

/**
 * Smaže oblast. Nabízí se jen u prázdných - stránka počty vazeb zná. Kdyby to
 * databáze přesto odmítla (někdo mezitím založil stroj), stránka se překreslí
 * beze změny; cizí klíč je poslední slovo.
 */
export async function smazOblast(id: string): Promise<void> {
  const supabase = await vytvorServerovehoKlienta()

  await supabase.from('oblast').delete().eq('id', id)

  obnov()
}

function prelozChybu(chyba: { code?: string; message: string }): string {
  if (chyba.code === '23505') return 'Oblast s tímto kódem už v číselníku je.'
  if (chyba.code === '23503')
    return 'Oblast nejde smazat — jsou na ni navázaná zařízení nebo šablony.'
  if (chyba.code === '42501') return 'Číselníky smí měnit administrátor a vedoucí údržby.'

  return `Uložení selhalo: ${chyba.message}`
}
