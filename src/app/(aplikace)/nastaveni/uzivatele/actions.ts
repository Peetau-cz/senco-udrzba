'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { nactiOsobu } from '@/lib/osoby/dotazy'
import {
  normalizujCisloKarty,
  overCisloKarty,
  overOsobu,
  textNeboNull,
  textNeboPrazdny,
} from '@/lib/osoby/osoba'
import { vytvorServerovehoKlienta } from '@/lib/supabase/server'
import type { Database } from '@/types/database.types'

export type StavOsoby = { chyba?: string }

type VztahKOblasti = Database['public']['Enums']['vztah_k_oblasti']

function obnov(osobaId?: string) {
  revalidatePath('/nastaveni/uzivatele')
  if (osobaId) revalidatePath(`/nastaveni/uzivatele/${osobaId}`)
}

function prectiUdaje(formData: FormData) {
  return {
    jmeno: textNeboPrazdny(formData.get('jmeno')),
    prijmeni: textNeboPrazdny(formData.get('prijmeni')),
    osobniCislo: textNeboNull(formData.get('osobni_cislo')),
    email: textNeboNull(formData.get('email')),
  }
}

/**
 * Hlášky z databáze jsou pro člověka nesrozumitelné jen u omezení, která se
 * dají porušit běžným vyplněním formuláře. Zbytek prochází, jak přišel.
 */
function prelozChybu(hlaska: string): string {
  const male = hlaska.toLowerCase()

  if (male.includes('profil_osobni_cislo_key')) {
    return 'Tohle osobní číslo už někdo má. Osobní číslo je v podniku jedinečné.'
  }
  if (male.includes('profil_email_idx')) {
    return 'Tenhle e-mail už u někoho je. Jeden člověk, jedna adresa.'
  }
  if (male.includes('karta_cislo_idx')) {
    return 'Karta s tímhle číslem už je někomu přiřazená. Nejdřív ji u něj vyřaďte.'
  }
  if (male.includes('row-level security') || male.includes('permission denied')) {
    return 'Na správu osob nemáte oprávnění.'
  }

  return hlaska
}

/**
 * Založí osobu.
 *
 * Mail je volitelný a u lidí z dílny zůstane prázdný - účet nedostanou.
 * Zakládat účty odsud nejde a je to úmysl: účty nežijí v našem schématu a
 * sáhnout na ně by znamenalo vzít si servisní klíč, což zásada R1 zakazuje.
 * Kdo přihlášení mít má, tomu ho administrátor vytvoří v Supabase a trigger
 * z migrace 0025 si ho k téhle osobě podle mailu sám připojí.
 */
export async function zalozOsobu(_predchozi: StavOsoby, formData: FormData): Promise<StavOsoby> {
  const udaje = prectiUdaje(formData)

  const namitka = overOsobu(udaje)
  if (namitka) return { chyba: namitka }

  const supabase = await vytvorServerovehoKlienta()

  const { data, error } = await supabase
    .from('profil')
    .insert({
      jmeno: udaje.jmeno,
      prijmeni: udaje.prijmeni,
      osobni_cislo: udaje.osobniCislo,
      email: udaje.email,
    })
    .select('id')
    .single()

  if (error) return { chyba: prelozChybu(error.message) }

  obnov()
  // Rovnou na detail: bez role a oblasti je osoba k ničemu - kiosek podle nich
  // vybírá, co jí ukázat.
  redirect(`/nastaveni/uzivatele/${data.id}`)
}

export async function ulozOsobu(
  osobaId: string,
  _predchozi: StavOsoby,
  formData: FormData,
): Promise<StavOsoby> {
  const udaje = prectiUdaje(formData)

  const namitka = overOsobu(udaje)
  if (namitka) return { chyba: namitka }

  const supabase = await vytvorServerovehoKlienta()

  const { error } = await supabase
    .from('profil')
    .update({
      jmeno: udaje.jmeno,
      prijmeni: udaje.prijmeni,
      osobni_cislo: udaje.osobniCislo,
      email: udaje.email,
    })
    .eq('id', osobaId)

  if (error) return { chyba: prelozChybu(error.message) }

  obnov(osobaId)
  return {}
}

/**
 * Vyřadí osobu z evidence, nebo ji vrátí zpátky.
 *
 * Mazat nejde a nemá: na osobu odkazuje historie údržby a deník. Vyřazený
 * člověk zmizí z nabídek, ale jeho podpis u starých záznamů zůstane.
 */
export async function prepniAktivituOsoby(osobaId: string, aktivni: boolean): Promise<void> {
  const supabase = await vytvorServerovehoKlienta()

  await supabase.from('profil').update({ aktivni }).eq('id', osobaId)

  obnov(osobaId)
}

/**
 * Uloží zařazení: role a oblasti.
 *
 * Role se u člověka bez účtu vyplňuje taky - není to jen oprávnění, ale
 * zároveň jeho PROFESE. Podle ní plánovač seskupuje zakázky
 * (`zakazka.profese_role_id`) a podle ní kiosek vybere, co tomu člověku
 * po přiložení karty ukázat.
 *
 * Ukládá se rozdílem, ne smazáním a vložením nanovo: obě tabulky mají auditní
 * trigger a přepis celého zařazení při každém uložení by z auditu udělal šum,
 * ve kterém by skutečná změna zanikla.
 */
export async function nastavZarazeni(
  osobaId: string,
  _predchozi: StavOsoby,
  formData: FormData,
): Promise<StavOsoby> {
  const osoba = await nactiOsobu(osobaId)
  if (!osoba) return { chyba: 'Osoba už neexistuje.' }

  const supabase = await vytvorServerovehoKlienta()

  const zvoleneRole = new Set(formData.getAll('role').map(String))
  const soucasneRole = new Set(osoba.role.map((r) => r.id))

  const roleKPridani = [...zvoleneRole].filter((id) => !soucasneRole.has(id))
  const roleKOdebrani = [...soucasneRole].filter((id) => !zvoleneRole.has(id))

  if (roleKPridani.length) {
    const { error } = await supabase
      .from('uzivatel_role')
      .insert(roleKPridani.map((roleId) => ({ uzivatel_id: osobaId, role_id: roleId })))
    if (error) return { chyba: prelozChybu(error.message) }
  }

  if (roleKOdebrani.length) {
    const { error } = await supabase
      .from('uzivatel_role')
      .delete()
      .eq('uzivatel_id', osobaId)
      .in('role_id', roleKOdebrani)
    if (error) return { chyba: prelozChybu(error.message) }
  }

  // Oblast má u každé osoby tři možné stavy: nezařazen, spolupracující, garant.
  // Formulář je posílá jedním polem na oblast, prázdná hodnota znamená odebrat.
  const soucasneOblasti = new Map(osoba.oblasti.map((o) => [o.id, o.vztah]))
  const kUlozeni: { uzivatel_id: string; oblast_id: string; vztah: VztahKOblasti }[] = []
  const kOdebrani: string[] = []

  for (const [klic, hodnota] of formData.entries()) {
    if (!klic.startsWith('oblast-')) continue

    const oblastId = klic.slice('oblast-'.length)
    const vztah = String(hodnota)

    if (vztah !== 'garant' && vztah !== 'spolupracujici') {
      if (soucasneOblasti.has(oblastId)) kOdebrani.push(oblastId)
      continue
    }

    if (soucasneOblasti.get(oblastId) !== vztah) {
      kUlozeni.push({ uzivatel_id: osobaId, oblast_id: oblastId, vztah })
    }
  }

  if (kUlozeni.length) {
    const { error } = await supabase
      .from('uzivatel_oblast')
      .upsert(kUlozeni, { onConflict: 'uzivatel_id,oblast_id' })
    if (error) return { chyba: prelozChybu(error.message) }
  }

  if (kOdebrani.length) {
    const { error } = await supabase
      .from('uzivatel_oblast')
      .delete()
      .eq('uzivatel_id', osobaId)
      .in('oblast_id', kOdebrani)
    if (error) return { chyba: prelozChybu(error.message) }
  }

  obnov(osobaId)
  return {}
}

/**
 * Spáruje kartu s osobou.
 *
 * Číslo přichází buď ze čtečky, která se chová jako klávesnice, nebo z ruky.
 * Tvar se proto srovná (`normalizujCisloKarty`) - stejně jako při identifikaci
 * u kiosku, jinak by se karta po ručním zadání nepoznala.
 */
export async function sparujKartu(
  osobaId: string,
  _predchozi: StavOsoby,
  formData: FormData,
): Promise<StavOsoby> {
  const zadane = textNeboPrazdny(formData.get('cislo'))

  const namitka = overCisloKarty(zadane)
  if (namitka) return { chyba: namitka }

  const supabase = await vytvorServerovehoKlienta()

  const { error } = await supabase
    .from('karta')
    .insert({ profil_id: osobaId, cislo: normalizujCisloKarty(zadane) })

  if (error) return { chyba: prelozChybu(error.message) }

  obnov(osobaId)
  return {}
}

/**
 * Vyřadí kartu. Nemaže se - ztracená karta má zůstat dohledatelná a číslo se
 * tím zároveň uvolní pro případ, že ho firma vydá znovu.
 */
export async function vyradKartu(kartaId: string, osobaId: string): Promise<void> {
  const supabase = await vytvorServerovehoKlienta()

  await supabase.from('karta').update({ aktivni: false }).eq('id', kartaId)

  obnov(osobaId)
}
