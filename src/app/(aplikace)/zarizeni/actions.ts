'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { vytvorServerovehoKlienta } from '@/lib/supabase/server'
import { chybyPodlePoli, overFormularZarizeni } from '@/lib/zarizeni/formular'
import { hodnotyZFormulare, poleParametru, prectiSchema } from '@/lib/zarizeni/parametry'

export type StavFormulareZarizeni = {
  /** Chyba celého formuláře - odepřený zápis, výpadek spojení. */
  chyba?: string
  /** Chyby u jednotlivých polí, klíčem je název pole ve formuláři. */
  chybyPoli?: Record<string, string>
}

function precti(formData: FormData) {
  return (nazevPole: string) => {
    const hodnota = formData.get(nazevPole)
    return typeof hodnota === 'string' ? hodnota : null
  }
}

/**
 * Založí nebo upraví zařízení. `id` je null při zakládání - stránka si akci
 * naváže přes bind, aby formulář zůstal pro obě situace jeden.
 *
 * Oprávnění se tu záměrně nekontroluje. Rozhoduje politika zarizeni_insert
 * a zarizeni_update; kdyby se to ověřovalo i tady, vznikla by druhá pravda.
 * Úkolem téhle funkce je přeložit odmítnutí databáze do věty pro uživatele.
 */
export async function ulozZarizeni(
  id: string | null,
  _predchozi: StavFormulareZarizeni,
  formData: FormData,
): Promise<StavFormulareZarizeni> {
  const vstup = overFormularZarizeni(precti(formData))

  if (!vstup.success) {
    return { chybyPoli: chybyPodlePoli(vstup.error) }
  }

  const supabase = await vytvorServerovehoKlienta()

  // Oblast se nevybírá, dědí se z typu - jinak by šlo uložit stroj do oblasti,
  // kam jeho typ nepatří. Složený cizí klíč v databázi to stejně nepustí.
  const { data: typ } = await supabase
    .from('typ_zarizeni')
    .select('id, oblast_id, schema_parametru')
    .eq('id', vstup.data.typ_zarizeni_id)
    .maybeSingle()

  if (!typ) {
    return {
      chybyPoli: {
        typ_zarizeni_id: 'Vybraný typ zařízení neexistuje nebo na něj nemáte právo.',
      },
    }
  }

  const schema = prectiSchema(typ.schema_parametru)
  const { hodnoty, chyby } = hodnotyZFormulare(schema, precti(formData))

  if (Object.keys(chyby).length > 0) {
    const chybyPoli: Record<string, string> = {}
    for (const [klic, hlaska] of Object.entries(chyby)) chybyPoli[poleParametru(klic)] = hlaska
    return { chybyPoli }
  }

  const zaznam = {
    ...vstup.data,
    oblast_id: typ.oblast_id,
    parametry: hodnoty,
  }

  if (id === null) {
    const { data, error } = await supabase.from('zarizeni').insert(zaznam).select('id').single()

    if (error) return prelozChybu(error)

    revalidatePath('/zarizeni')
    redirect(`/zarizeni/${data.id}`)
  }

  const { data, error } = await supabase
    .from('zarizeni')
    .update(zaznam)
    .eq('id', id)
    .select('id')

  if (error) return prelozChybu(error)

  // Politika zamítnutý UPDATE nehlásí chybou, jen nezmění žádný řádek.
  if ((data ?? []).length === 0) {
    return { chyba: 'Zařízení se nepodařilo uložit — nemáte právo měnit tuto oblast.' }
  }

  revalidatePath('/zarizeni')
  revalidatePath(`/zarizeni/${id}`)
  redirect(`/zarizeni/${id}`)
}

function prelozChybu(chyba: { code?: string; message: string }): StavFormulareZarizeni {
  // 23505 = porušení jedinečnosti. Jediný unikátní sloupec je inventární číslo.
  if (chyba.code === '23505') {
    return { chybyPoli: { inventarni_cislo: 'Toto inventární číslo už má jiné zařízení.' } }
  }

  // 42501 = odmítnuto politikou RLS.
  if (chyba.code === '42501') {
    return { chyba: 'Nemáte oprávnění zakládat zařízení v této oblasti.' }
  }

  // 23514 = porušení CHECK; sem patří i hlášky z triggeru nad parametry, které
  // jsou psané pro uživatele, ne pro vývojáře.
  if (chyba.code === '23514') {
    return { chyba: chyba.message }
  }

  return { chyba: `Uložení selhalo: ${chyba.message}` }
}
