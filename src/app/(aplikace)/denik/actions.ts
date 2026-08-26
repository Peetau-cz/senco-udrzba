'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { cestaFotkyZasahu, overDobu, overPopis, pragskyCasNaIso } from '@/lib/denik/zasah'
import { overFotku } from '@/lib/plan/fotky'
import { NADOBA_DENIKU, smazSoubory, ulozSoubor } from '@/lib/storage'
import { vytvorServerovehoKlienta } from '@/lib/supabase/server'

export type StavZasahu = {
  /** Chyba celého formuláře - odepřený zápis, výpadek spojení. */
  chyba?: string
  /** Chyby u jednotlivých polí, klíčem je název pole ve formuláři. */
  chybyPoli?: Record<string, string>
}

export type StavFotky = { chyba?: string; hotovo?: string }

type PolaZasahu = {
  zarizeniId: string
  druhId: string
  popis: string
  kdy: string
  provedlId: string | null
  doba: number | null
}

function precti(formData: FormData, nazev: string): string {
  const hodnota = formData.get(nazev)
  return typeof hodnota === 'string' ? hodnota.trim() : ''
}

/** Společná kontrola pro zápis i opravu - obojí plní tatáž pole. */
function overPola(formData: FormData): { chybyPoli: Record<string, string> } | { pola: PolaZasahu } {
  const zarizeniId = precti(formData, 'zarizeni_id')
  const druhId = precti(formData, 'druh_zasahu_id')
  const popis = precti(formData, 'popis')
  const provedlId = precti(formData, 'provedl_id')

  const chybyPoli: Record<string, string> = {}

  if (!zarizeniId) chybyPoli.zarizeni_id = 'Vyberte stroj.'
  if (!druhId) chybyPoli.druh_zasahu_id = 'Vyberte druh zásahu.'

  const namitkaPopisu = overPopis(popis)
  if (namitkaPopisu) chybyPoli.popis = namitkaPopisu

  const kdy = pragskyCasNaIso(precti(formData, 'provedeno'))
  if (!kdy) chybyPoli.provedeno = 'Zadejte, kdy se zásah provedl.'

  const doba = overDobu(precti(formData, 'doba_trvani_min'))
  if ('chyba' in doba) chybyPoli.doba_trvani_min = doba.chyba

  if (Object.keys(chybyPoli).length > 0) return { chybyPoli }

  return {
    pola: {
      zarizeniId,
      druhId,
      popis,
      kdy: kdy as string,
      provedlId: provedlId || null,
      doba: 'hodnota' in doba ? doba.hodnota : null,
    },
  }
}

/** Oblast se nevybírá, dědí se ze stroje - do deníku se zapisuje k mašině. */
async function oblastStroje(zarizeniId: string): Promise<string | null> {
  const supabase = await vytvorServerovehoKlienta()

  const { data } = await supabase
    .from('zarizeni')
    .select('oblast_id')
    .eq('id', zarizeniId)
    .maybeSingle()

  return data?.oblast_id ?? null
}

/**
 * Zapíše neplánovaný zásah do deníku.
 *
 * Oprávnění se tu záměrně neověřuje - rozhoduje politika provozni_denik_insert.
 * Úkolem téhle funkce je přeložit odmítnutí databáze do věty pro uživatele.
 *
 * `zapsal_id` se schválně neposílá. Doplní ho výchozí hodnota sloupce
 * z přihlášení a politika trvá na tom, aby seděla - kdo zápis pořídil,
 * rozhoduje o právu na opravu, takže se to nesmí dát podstrčit z formuláře.
 */
export async function zapisZasah(_predchozi: StavZasahu, formData: FormData): Promise<StavZasahu> {
  const vysledek = overPola(formData)
  if ('chybyPoli' in vysledek) return vysledek

  // Fotka se ověřuje JEŠTĚ PŘED zápisem. Zápis se totiž nedá smazat (migrace
  // 0020), takže špatný formát zjištěný až po vložení řádku by nechal v deníku
  // zápis bez fotky a uživatele bez možnosti vrátit se o krok zpět.
  const fotka = formData.get('fotka')
  const maFotku = fotka instanceof File && fotka.size > 0

  if (maFotku) {
    const namitka = overFotku({ velikost: fotka.size, mime: fotka.type })
    if (namitka) return { chybyPoli: { fotka: namitka } }
  }

  const { pola } = vysledek
  const oblastId = await oblastStroje(pola.zarizeniId)

  if (!oblastId) {
    return { chybyPoli: { zarizeni_id: 'Vybraný stroj neexistuje nebo na něj nemáte právo.' } }
  }

  const supabase = await vytvorServerovehoKlienta()

  const { data: zapis, error } = await supabase
    .from('provozni_denik')
    .insert({
      zarizeni_id: pola.zarizeniId,
      oblast_id: oblastId,
      druh_zasahu_id: pola.druhId,
      popis: pola.popis,
      provedeno_at: pola.kdy,
      provedl_id: pola.provedlId,
      doba_trvani_min: pola.doba,
    })
    .select('id')
    .single()

  if (error) return prelozChybu(error)

  // Zápis už v deníku je. Když teď selže úložiště, není cesta zpět - řádek se
  // smazat nedá a nemá. Uživateli se to řekne na seznamu a fotku přidá znovu
  // v detailu zápisu; ztratit celý zápis kvůli fotce by bylo horší.
  const fotkaSelhala = maFotku ? Boolean(await nahrajKZapisu(zapis.id, fotka)) : false

  revalidatePath('/denik')
  revalidatePath(`/zarizeni/${pola.zarizeniId}`)

  redirect(fotkaSelhala ? '/denik?zapsano=1&fotka=chyba' : '/denik?zapsano=1')
}

/**
 * Opraví zápis.
 *
 * Kdo a dokdy smí opravovat, rozhoduje databáze - trigger ze 0020 nad funkcí
 * muze_menit_zapis_deniku z 0022. Aplikace okno nepočítá, jen ukazuje nebo
 * neukazuje formulář; poslední slovo má i tak databáze a její hláška.
 */
export async function upravZasah(
  id: string,
  _predchozi: StavZasahu,
  formData: FormData,
): Promise<StavZasahu> {
  const vysledek = overPola(formData)
  if ('chybyPoli' in vysledek) return vysledek

  const { pola } = vysledek
  const oblastId = await oblastStroje(pola.zarizeniId)

  if (!oblastId) {
    return { chybyPoli: { zarizeni_id: 'Vybraný stroj neexistuje nebo na něj nemáte právo.' } }
  }

  const supabase = await vytvorServerovehoKlienta()

  const { data, error } = await supabase
    .from('provozni_denik')
    .update({
      // Stroj a oblast se mění jedním klíčem - nejčastější chyba je vybraný
      // špatný stroj a zápis, který jde opravit jen v popisu, by kvůli ní
      // zůstal navěky u cizí mašiny.
      zarizeni_id: pola.zarizeniId,
      oblast_id: oblastId,
      druh_zasahu_id: pola.druhId,
      popis: pola.popis,
      provedeno_at: pola.kdy,
      provedl_id: pola.provedlId,
      doba_trvani_min: pola.doba,
    })
    .eq('id', id)
    .select('id')

  if (error) return prelozChybu(error)

  // Zamítnutý UPDATE nehlásí chybu, jen nezmění žádný řádek.
  if ((data ?? []).length === 0) {
    return { chyba: 'Zápis se nepodařilo uložit — nemáte právo měnit deník téhle oblasti.' }
  }

  revalidatePath('/denik')
  revalidatePath(`/denik/${id}`)
  revalidatePath(`/zarizeni/${pola.zarizeniId}`)

  redirect(`/denik/${id}?ulozeno=1`)
}

/** Přidá fotku k hotovému zápisu. Okno na opravu hlídá trigger i úložiště. */
export async function pridejFotkuZasahu(
  zapisId: string,
  _predchozi: StavFotky,
  formData: FormData,
): Promise<StavFotky> {
  const fotka = formData.get('fotka')

  if (!(fotka instanceof File) || fotka.size === 0) return { chyba: 'Vyberte fotku.' }

  const namitka = overFotku({ velikost: fotka.size, mime: fotka.type })
  if (namitka) return { chyba: namitka }

  const chyba = await nahrajKZapisu(zapisId, fotka)
  if (chyba) return { chyba }

  revalidatePath(`/denik/${zapisId}`)
  return { hotovo: 'Fotka je nahraná.' }
}

/**
 * Odebere fotku ze zápisu.
 *
 * Nejdřív úložiště, pak řádek. Kdyby to bylo obráceně a druhý krok selhal,
 * zůstal by v deníku odkaz na soubor, který už neexistuje. Trigger to udělat
 * nemůže - Supabase nad storage.objects přímé DML nedovolí (migrace 0016).
 */
export async function smazFotkuZasahu(zapisId: string, fotkaId: string): Promise<void> {
  const supabase = await vytvorServerovehoKlienta()

  const { data: fotka } = await supabase
    .from('denik_foto')
    .select('id, storage_path')
    .eq('id', fotkaId)
    .maybeSingle()

  if (!fotka) return

  if (await smazSoubory(NADOBA_DENIKU, [fotka.storage_path])) return

  await supabase.from('denik_foto').delete().eq('id', fotkaId)

  revalidatePath(`/denik/${zapisId}`)
}

/** Uloží soubor a připojí ho k zápisu. Vrací hlášku, nebo null při úspěchu. */
async function nahrajKZapisu(zapisId: string, fotka: File): Promise<string | null> {
  const cesta = cestaFotkyZasahu(zapisId, fotka.type, randomUUID())

  const chybaUlozeni = await ulozSoubor(NADOBA_DENIKU, cesta, fotka, fotka.type)
  if (chybaUlozeni) return chybaUlozeni

  const supabase = await vytvorServerovehoKlienta()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { error } = await supabase.from('denik_foto').insert({
    zaznam_id: zapisId,
    storage_path: cesta,
    nahral_id: user?.id ?? null,
  })

  if (error) {
    // Bez řádku v databázi je soubor v úložišti neviditelný a nikdo ho už
    // nesmaže. Proto se úklid dělá hned, ne až někdy.
    await smazSoubory(NADOBA_DENIKU, [cesta])
    return `Fotku se nepodařilo připojit k zápisu: ${error.message}`
  }

  return null
}

function prelozChybu(chyba: { code?: string; message: string }): StavZasahu {
  // 42501 přijde ze dvou míst: z RLS (anglicky, od PostgreSQL) a z triggerů nad
  // deníkem, které hlásí česky a rovnou uživateli („Zápis je starší než 24
  // hodin…"). Hlášku z triggeru má smysl ukázat, obecnou o politice ne.
  if (chyba.code === '42501') {
    return chyba.message.includes('row-level security')
      ? { chyba: 'Do deníku téhle oblasti nemáte právo zapisovat.' }
      : { chyba: chyba.message }
  }

  // 23503 = cizí klíč. Buď zmizel druh zásahu, nebo stroj nesedí s oblastí.
  if (chyba.code === '23503') {
    return { chyba: 'Vybraný stroj nebo druh zásahu už v číselníku není.' }
  }

  // 23514 = porušení CHECK a hlášky z triggerů; ty jsou psané pro uživatele.
  if (chyba.code === '23514') {
    return { chyba: chyba.message }
  }

  return { chyba: `Zápis se nepodařilo uložit: ${chyba.message}` }
}
