'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { smazSoubory, ulozSoubor } from '@/lib/storage'
import { vytvorServerovehoKlienta } from '@/lib/supabase/server'
import { cestaSouboru, jeDruhSouboru, overSoubor, zkratNazev } from '@/lib/zarizeni/soubory'

export type StavNahrani = {
  chyba?: string
  hotovo?: string
}

/**
 * Nahraje soubor ke kartě zařízení.
 *
 * Soubor jde přes server, ne přímo z prohlížeče do úložiště. Je to o jeden
 * přenos navíc, ale zápis do `zarizeni_soubor` a uložení souboru tak zůstávají
 * v jedné funkci - když selže druhý krok, první se dá vzít zpět. Při nahrávání
 * přímo z prohlížeče by šlo skončit se souborem v úložišti a bez řádku v
 * databázi, tedy s přílohou, kterou nikdo neuvidí a nikdo neuklidí.
 *
 * Oprávnění řeší politiky nad storage.objects z migrace 0004, ne tenhle kód.
 */
export async function nahrajSoubor(
  zarizeniId: string,
  _predchozi: StavNahrani,
  formData: FormData,
): Promise<StavNahrani> {
  const druh = formData.get('druh')
  if (typeof druh !== 'string' || !jeDruhSouboru(druh)) {
    return { chyba: 'Vyberte, o jaký druh souboru jde.' }
  }

  const soubor = formData.get('soubor')
  if (!(soubor instanceof File) || soubor.size === 0) {
    return { chyba: 'Vyberte soubor.' }
  }

  // MIME hlásí prohlížeč a dá se podvrhnout. Druhý zámek je na nádobě
  // (allowed_mime_types v migraci 0004), tahle kontrola je kvůli hlášce.
  const namitka = overSoubor({ nazev: soubor.name, velikost: soubor.size, mime: soubor.type })
  if (namitka) return { chyba: namitka }

  const supabase = await vytvorServerovehoKlienta()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { chyba: 'Přihlášení vypršelo. Přihlaste se znovu.' }

  const cesta = cestaSouboru(zarizeniId, soubor.type, randomUUID())

  const chybaUlozeni = await ulozSoubor(cesta, soubor, soubor.type)
  if (chybaUlozeni) return { chyba: chybaUlozeni }

  const { error: chybaZapisu } = await supabase.from('zarizeni_soubor').insert({
    zarizeni_id: zarizeniId,
    druh,
    nazev: zkratNazev(soubor.name),
    cesta,
    mime: soubor.type,
    velikost_b: soubor.size,
    nahral_id: user.id,
  })

  if (chybaZapisu) {
    // Bez řádku v databázi je soubor v úložišti neviditelný a nikdo ho už
    // nesmaže. Proto se úklid dělá hned, ne až někdy.
    await smazSoubory([cesta])
    return { chyba: `Soubor se nepodařilo připojit ke kartě: ${chybaZapisu.message}` }
  }

  revalidatePath(`/zarizeni/${zarizeniId}`)
  return { hotovo: `Soubor „${zkratNazev(soubor.name, 40)}" je nahraný.` }
}

/**
 * Smaže soubor z karty.
 *
 * Nejdřív úložiště, pak řádek. Kdyby to bylo obráceně a druhý krok selhal,
 * v seznamu by zůstal záznam odkazující na soubor, který už neexistuje.
 */
export async function smazSoubor(zarizeniId: string, souborId: string): Promise<void> {
  const supabase = await vytvorServerovehoKlienta()

  const { data: soubor } = await supabase
    .from('zarizeni_soubor')
    .select('id, cesta')
    .eq('id', souborId)
    .maybeSingle()

  if (!soubor) return

  if (await smazSoubory([soubor.cesta])) return

  await supabase.from('zarizeni_soubor').delete().eq('id', souborId)

  revalidatePath(`/zarizeni/${zarizeniId}`)
}
