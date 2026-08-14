/**
 * Přístup k úložišti souborů.
 *
 * Jediné místo v aplikaci, které ví, že soubory leží v Supabase Storage.
 * Stránky, serverové akce ani dotazová vrstva `supabase.storage` nevolají -
 * `docs/PORTABILITA.md` pravidlo 5 to zakazuje a důvod je prostý: úložiště je
 * ta část Supabase, která se při přesunu na firemní server nepřenese sama.
 * Až přijde S3 nebo souborový systém, mění se tenhle soubor a nic jiného.
 *
 * Proto sem patří i překlad chyb: hlášky typu „exceeded the maximum allowed
 * size" jsou jazyk konkrétního úložiště. Ven jde česká věta pro uživatele,
 * nebo `null`, když se povedlo - stejná úmluva jako u `overSoubor`.
 */

import { vytvorServerovehoKlienta } from '@/lib/supabase/server'

/** Nádoba v úložišti. Vzniká v migraci 0004 a je neveřejná. */
export const NADOBA_SOUBORU = 'zarizeni'

/**
 * Jak dlouho platí odkaz na soubor. Hodina bohatě stačí na otevření návodu i na
 * jeho stažení do tabletu, a přitom se odkaz nedá donekonečna přeposílat dál.
 */
export const PLATNOST_ODKAZU_S = 3600

/**
 * Uloží soubor pod danou cestu.
 *
 * `upsert: false` schválně - cesta obsahuje náhodné id, takže shoda by
 * znamenala chybu jinde a přepsat cizí soubor je horší než selhat.
 */
export async function ulozSoubor(cesta: string, obsah: File, mime: string): Promise<string | null> {
  const supabase = await vytvorServerovehoKlienta()

  const { error } = await supabase.storage
    .from(NADOBA_SOUBORU)
    .upload(cesta, obsah, { contentType: mime, upsert: false })

  return error ? prelozChybu(error.message) : null
}

/** Smaže soubory z úložiště. Chybějící soubor není chyba - výsledek je stejný. */
export async function smazSoubory(cesty: string[]): Promise<string | null> {
  if (cesty.length === 0) return null

  const supabase = await vytvorServerovehoKlienta()
  const { error } = await supabase.storage.from(NADOBA_SOUBORU).remove(cesty)

  return error ? prelozChybu(error.message) : null
}

/**
 * Dočasné odkazy ke stažení, klíčované cestou.
 *
 * Podepisuje se jedním voláním pro všechny soubory najednou - kdyby se volalo
 * v cyklu, karta s deseti přílohami by čekala na deset kol sítě.
 *
 * Když se odkaz nepodaří vyrobit, chybí v mapě a soubor se v seznamu pořád
 * ukáže, jen bez možnosti otevřít. Lepší než celá karta se zprávou o chybě.
 */
export async function odkazyKeStazeni(cesty: string[]): Promise<Map<string, string>> {
  if (cesty.length === 0) return new Map()

  const supabase = await vytvorServerovehoKlienta()
  const { data } = await supabase.storage
    .from(NADOBA_SOUBORU)
    .createSignedUrls(cesty, PLATNOST_ODKAZU_S)

  const odkazy = new Map<string, string>()
  for (const polozka of data ?? []) {
    if (polozka.path && polozka.signedUrl) odkazy.set(polozka.path, polozka.signedUrl)
  }

  return odkazy
}

function prelozChybu(hlaska: string): string {
  const male = hlaska.toLowerCase()

  if (male.includes('row-level security') || male.includes('unauthorized')) {
    return 'Nemáte oprávnění nahrávat soubory k tomuto zařízení.'
  }
  if (male.includes('exceeded the maximum allowed size') || male.includes('payload too large')) {
    return 'Soubor je pro úložiště příliš velký.'
  }
  if (male.includes('mime type') || male.includes('not allowed')) {
    return 'Tenhle typ souboru úložiště nepřijímá.'
  }

  return `Úložiště odmítlo soubor: ${hlaska}`
}
