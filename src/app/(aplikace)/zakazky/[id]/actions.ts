'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { doplnOdpovedi, prectiCislo, prectiVyplneneBody } from '@/lib/plan/body'
import { cestaFotky, overFotku } from '@/lib/plan/fotky'
import { NADOBA_ZAKAZEK, smazSoubory, ulozSoubor } from '@/lib/storage'
import { vytvorServerovehoKlienta } from '@/lib/supabase/server'

export type StavKroku = {
  chyba?: string
  hotovo?: string
}

/**
 * Serverové akce checklistu.
 *
 * Oprávnění tu nikde nekontrolujeme: politiky z migrace 0011 a sloupcová práva
 * rozhodují za nás (zásada R1). Kdo na provedení údržby v dané oblasti nemá
 * právo, tomu UPDATE neprojde a řádek se nezmění. Zamrazení dokončené zakázky
 * hlídají triggery, ne tenhle kód.
 */

function obnov(zakazkaId: string) {
  revalidatePath(`/zakazky/${zakazkaId}`)
  revalidatePath('/plan')
}

/** Technik zakázku otevřel a jde k ní. Poznamená se čas, ne kdo - ten je v auditu. */
export async function zahajZakazku(zakazkaId: string): Promise<void> {
  const supabase = await vytvorServerovehoKlienta()

  await supabase
    .from('zakazka')
    .update({ stav: 'probiha', zahajeno_at: new Date().toISOString() })
    .eq('id', zakazkaId)
    .eq('stav', 'naplanovano')

  obnov(zakazkaId)
}

/** Vezme si zakázku na sebe, nebo ji zase pustí. */
export async function prevezmiZakazku(zakazkaId: string, prevzit: boolean): Promise<void> {
  const supabase = await vytvorServerovehoKlienta()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  await supabase
    .from('zakazka')
    .update({ prirazeno_uzivateli_id: prevzit ? (user?.id ?? null) : null })
    .eq('id', zakazkaId)

  obnov(zakazkaId)
}

/**
 * Potvrdí krok checklistu, nebo ho označí za neproveditelný.
 *
 * Zadání kontrolních bodů se do formuláře posílá jen ke čtení a zpátky se bere
 * z databáze - jinak by se dalo cestou přepsat a zamrazená matice by přestala
 * platit. Trigger v migraci 0011 by takový zápis odmítl, tohle je proto, aby
 * k němu nedošlo.
 */
export async function ulozKrok(
  zakazkaId: string,
  krokId: string,
  _predchozi: StavKroku,
  formData: FormData,
): Promise<StavKroku> {
  const zamer = formData.get('zamer')
  const nelzeProvest = zamer === 'nelze_provest'

  const supabase = await vytvorServerovehoKlienta()

  const { data: krok, error: chybaKroku } = await supabase
    .from('zakazka_ukon')
    .select('id, kontrolni_body, vyzaduje_hodnotu, jednotka_snapshot')
    .eq('id', krokId)
    .maybeSingle()

  if (chybaKroku) return { chyba: `Krok se nepodařilo načíst: ${chybaKroku.message}` }
  if (!krok) return { chyba: 'Krok už neexistuje.' }

  const poznamka = textNeboNull(formData.get('poznamka'))

  if (nelzeProvest && !poznamka) {
    return { chyba: 'Napište, proč krok nešel provést. Bez důvodu je záznam k ničemu.' }
  }

  const hodnota = prectiCislo(textNeboNull(formData.get('hodnota')))

  if (!nelzeProvest && krok.vyzaduje_hodnotu && hodnota === null) {
    return {
      chyba: krok.jednotka_snapshot
        ? `Zapište naměřenou hodnotu v ${krok.jednotka_snapshot}.`
        : 'Zapište naměřenou hodnotu.',
    }
  }

  const puvodni = prectiVyplneneBody(krok.kontrolni_body)
  const odpovedi = puvodni.map((_bod, poradi) => ({
    hodnota: textNeboNull(formData.get(`bod-hodnota-${poradi}`)),
    ano: prectiAnoNe(formData.get(`bod-ano-${poradi}`)),
  }))

  const { error } = await supabase
    .from('zakazka_ukon')
    .update({
      stav: nelzeProvest ? 'nelze_provest' : 'splneno',
      hodnota: nelzeProvest ? null : hodnota,
      poznamka,
      kontrolni_body: doplnOdpovedi(puvodni, odpovedi),
      potvrzeno_at: new Date().toISOString(),
      potvrdil_id: (await supabase.auth.getUser()).data.user?.id ?? null,
    })
    .eq('id', krokId)

  if (error) return { chyba: prelozChybuZapisu(error.message) }

  obnov(zakazkaId)
  return { hotovo: nelzeProvest ? 'Zapsáno jako neproveditelné.' : 'Krok potvrzen.' }
}

/** Vrátí potvrzený krok zpátky k vyřízení. Jen dokud je zakázka otevřená. */
export async function vratKrok(zakazkaId: string, krokId: string): Promise<void> {
  const supabase = await vytvorServerovehoKlienta()

  await supabase
    .from('zakazka_ukon')
    .update({ stav: 'nesplneno', potvrzeno_at: null, potvrdil_id: null })
    .eq('id', krokId)

  obnov(zakazkaId)
}

/**
 * Nahraje fotku ke kroku.
 *
 * Soubor jde přes server, ne přímo z prohlížeče do úložiště - stejný důvod jako
 * u příloh zařízení: zápis do `zakazka_foto` a uložení souboru tak zůstávají
 * v jedné funkci a při selhání druhého kroku se první dá vzít zpět.
 */
export async function nahrajFotku(
  zakazkaId: string,
  krokId: string,
  _predchozi: StavKroku,
  formData: FormData,
): Promise<StavKroku> {
  const fotka = formData.get('fotka')
  if (!(fotka instanceof File) || fotka.size === 0) return { chyba: 'Vyberte fotku.' }

  // MIME hlásí prohlížeč a dá se podvrhnout. Druhý zámek je na nádobě
  // (allowed_mime_types v migraci 0012), tahle kontrola je kvůli hlášce.
  const namitka = overFotku({ velikost: fotka.size, mime: fotka.type })
  if (namitka) return { chyba: namitka }

  const supabase = await vytvorServerovehoKlienta()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { chyba: 'Přihlášení vypršelo. Přihlaste se znovu.' }

  const cesta = cestaFotky(zakazkaId, fotka.type, randomUUID())

  const chybaUlozeni = await ulozSoubor(NADOBA_ZAKAZEK, cesta, fotka, fotka.type)
  if (chybaUlozeni) return { chyba: chybaUlozeni }

  const { error } = await supabase.from('zakazka_foto').insert({
    zakazka_ukon_id: krokId,
    storage_path: cesta,
    popis: textNeboNull(formData.get('popis')),
    nahral_id: user.id,
  })

  if (error) {
    // Soubor už v úložišti leží; bez řádku by ho nikdo neviděl ani neuklidil.
    await smazSoubory(NADOBA_ZAKAZEK, [cesta])
    return { chyba: prelozChybuZapisu(error.message) }
  }

  obnov(zakazkaId)
  return { hotovo: 'Fotka nahrána.' }
}

/** Smaže fotku. Řádek i soubor - o soubor se navíc postará trigger z 0012. */
export async function smazFotku(zakazkaId: string, fotkaId: string): Promise<void> {
  const supabase = await vytvorServerovehoKlienta()

  const { data: fotka } = await supabase
    .from('zakazka_foto')
    .select('id, storage_path')
    .eq('id', fotkaId)
    .maybeSingle()

  if (!fotka) return

  const { error } = await supabase.from('zakazka_foto').delete().eq('id', fotkaId)
  if (error) return

  await smazSoubory(NADOBA_ZAKAZEK, [fotka.storage_path])
  obnov(zakazkaId)
}

/**
 * Dokončí zakázku.
 *
 * Volá se databázová funkce, ne UPDATE: uzavření zakázky a posun plánu musí být
 * jedna transakce, jinak by zůstala hotová údržba s termínem, který už proběhl,
 * a plánovač by ji naplánoval znovu. Kontrolu nevyřízených kroků a povinných
 * fotek dělá tatáž funkce - má na to čerstvá data a nikdo ji neobejde.
 */
export async function dokonciZakazku(zakazkaId: string): Promise<StavKroku> {
  const supabase = await vytvorServerovehoKlienta()

  const { error } = await supabase.rpc('dokonci_zakazku', { p_zakazka: zakazkaId })

  if (error) return { chyba: prelozChybuZapisu(error.message) }

  obnov(zakazkaId)
  return { hotovo: 'Údržba dokončena.' }
}

/** Zruší naplánovanou zakázku. Zrušená je uzavřená, znovu se nespustí. */
export async function zrusZakazku(zakazkaId: string, duvod: string): Promise<StavKroku> {
  const text = duvod.trim()
  if (!text) return { chyba: 'Napište, proč se zakázka ruší.' }

  const supabase = await vytvorServerovehoKlienta()

  const { error } = await supabase
    .from('zakazka')
    .update({ stav: 'zruseno', poznamka: text })
    .eq('id', zakazkaId)

  if (error) return { chyba: prelozChybuZapisu(error.message) }

  obnov(zakazkaId)
  return { hotovo: 'Zakázka zrušena.' }
}

function textNeboNull(hodnota: FormDataEntryValue | null): string | null {
  if (typeof hodnota !== 'string') return null
  const cisty = hodnota.trim()
  return cisty === '' ? null : cisty
}

/** Trojstav z přepínače: „ano" / „ne" / nevyplněno. */
function prectiAnoNe(hodnota: FormDataEntryValue | null): boolean | null {
  if (hodnota === 'ano') return true
  if (hodnota === 'ne') return false
  return null
}

/**
 * Hlášky z databáze jsou v tomhle modulu psané pro člověka - triggery i funkce
 * z migrací 0011 a 0013 vyhazují české věty. Prochází proto skoro beze změny;
 * překládá se jen to, co lidsky napsané není.
 */
function prelozChybuZapisu(hlaska: string): string {
  const male = hlaska.toLowerCase()

  if (male.includes('row-level security') || male.includes('permission denied')) {
    return 'Nemáte oprávnění zapisovat do této zakázky.'
  }

  return hlaska
}
