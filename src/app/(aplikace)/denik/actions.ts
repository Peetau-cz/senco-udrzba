'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { cestaFotkyZasahu, overDobu, overPopis, pragskyCasNaIso } from '@/lib/denik/zasah'
import { overFotku } from '@/lib/plan/fotky'
import { NADOBA_DENIKU, ulozSoubor } from '@/lib/storage'
import { vytvorServerovehoKlienta } from '@/lib/supabase/server'

export type StavZasahu = {
  /** Chyba celého formuláře - odepřený zápis, výpadek spojení. */
  chyba?: string
  /** Chyby u jednotlivých polí, klíčem je název pole ve formuláři. */
  chybyPoli?: Record<string, string>
}

function precti(formData: FormData, nazev: string): string {
  const hodnota = formData.get(nazev)
  return typeof hodnota === 'string' ? hodnota.trim() : ''
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
export async function zapisZasah(
  _predchozi: StavZasahu,
  formData: FormData,
): Promise<StavZasahu> {
  const zarizeniId = precti(formData, 'zarizeni_id')
  const druhId = precti(formData, 'druh_zasahu_id')
  const popis = precti(formData, 'popis')
  const provedeno = precti(formData, 'provedeno')
  const provedlId = precti(formData, 'provedl_id')

  const chybyPoli: Record<string, string> = {}

  if (!zarizeniId) chybyPoli.zarizeni_id = 'Vyberte stroj.'
  if (!druhId) chybyPoli.druh_zasahu_id = 'Vyberte druh zásahu.'

  const namitkaPopisu = overPopis(popis)
  if (namitkaPopisu) chybyPoli.popis = namitkaPopisu

  const kdy = pragskyCasNaIso(provedeno)
  if (!kdy) chybyPoli.provedeno = 'Zadejte, kdy se zásah provedl.'

  const doba = overDobu(precti(formData, 'doba_trvani_min'))
  if ('chyba' in doba) chybyPoli.doba_trvani_min = doba.chyba

  // Fotka se ověřuje JEŠTĚ PŘED zápisem. Zápis se totiž nedá smazat (migrace
  // 0020), takže špatný formát zjištěný až po vložení řádku by nechal v deníku
  // zápis bez fotky a uživatele bez možnosti vrátit se o krok zpět.
  const fotka = formData.get('fotka')
  const maFotku = fotka instanceof File && fotka.size > 0

  if (maFotku) {
    const namitka = overFotku({ velikost: fotka.size, mime: fotka.type })
    if (namitka) chybyPoli.fotka = namitka
  }

  if (Object.keys(chybyPoli).length > 0) return { chybyPoli }

  const supabase = await vytvorServerovehoKlienta()

  // Oblast se nevybírá, dědí se ze stroje - do deníku se zapisuje k mašině,
  // ne do oblasti. Složený cizí klíč v migraci 0020 stejně nepustí dvojici,
  // která spolu nesedí.
  const { data: stroj } = await supabase
    .from('zarizeni')
    .select('id, oblast_id')
    .eq('id', zarizeniId)
    .maybeSingle()

  if (!stroj) {
    return { chybyPoli: { zarizeni_id: 'Vybraný stroj neexistuje nebo na něj nemáte právo.' } }
  }

  const { data: zapis, error } = await supabase
    .from('provozni_denik')
    .insert({
      zarizeni_id: stroj.id,
      oblast_id: stroj.oblast_id,
      druh_zasahu_id: druhId,
      popis,
      provedeno_at: kdy as string,
      provedl_id: provedlId || null,
      doba_trvani_min: 'hodnota' in doba ? doba.hodnota : null,
    })
    .select('id')
    .single()

  if (error) return prelozChybu(error)

  // Zápis už v deníku je. Když teď selže úložiště, není cesta zpět - řádek se
  // smazat nedá a nemá se. Uživateli se to proto řekne na seznamu a fotku
  // přidá znovu; ztratit celý zápis kvůli fotce by bylo horší.
  let fotkaSelhala = false

  if (maFotku) {
    const cesta = cestaFotkyZasahu(zapis.id, fotka.type, randomUUID())
    const chybaUlozeni = await ulozSoubor(NADOBA_DENIKU, cesta, fotka, fotka.type)

    if (chybaUlozeni) {
      fotkaSelhala = true
    } else {
      const { error: chybaZapisu } = await supabase.from('denik_foto').insert({
        zaznam_id: zapis.id,
        storage_path: cesta,
        nahral_id: (await supabase.auth.getUser()).data.user?.id ?? null,
      })

      if (chybaZapisu) fotkaSelhala = true
    }
  }

  revalidatePath('/denik')
  revalidatePath(`/zarizeni/${stroj.id}`)

  redirect(fotkaSelhala ? '/denik?zapsano=1&fotka=chyba' : '/denik?zapsano=1')
}

function prelozChybu(chyba: { code?: string; message: string }): StavZasahu {
  // 42501 = odmítnuto politikou RLS.
  if (chyba.code === '42501') {
    return { chyba: 'Do deníku téhle oblasti nemáte právo zapisovat.' }
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
