'use server'

import { revalidatePath } from 'next/cache'
import { vytvorServerovehoKlienta } from '@/lib/supabase/server'

export type StavTerminu = {
  chyba?: string
  hotovo?: string
}

/** `YYYY-MM-DD`, jak ho posílá `<input type="date">` i jak ho čte sloupec `date`. */
const TVAR_DATA = /^\d{4}-\d{2}-\d{2}$/

/**
 * Uloží termíny příští údržby zadané garantem.
 *
 * Termíny se ukládají po jednom, ne jedním hromadným zápisem. Supabase-js neumí
 * transakci a hromadný `upsert` by u řádků, které se nemění, přepsal
 * `zmeneno_at` - v auditním logu by pak každé uložení vypadalo jako změna všech
 * šestnácti úkonů. Posílají se proto jen ty řádky, kde se datum opravdu liší.
 *
 * Oprávnění řeší politika plan_udrzby_zapis z migrace 0010, ne tenhle kód:
 * kdo na plán v dané oblasti nemá právo, tomu UPDATE neprojde a řádek se
 * nezmění. Kontrola v aplikaci by byla druhá pravda (zásada R1).
 */
export async function ulozTerminy(
  zarizeniId: string,
  _predchozi: StavTerminu,
  formData: FormData,
): Promise<StavTerminu> {
  const supabase = await vytvorServerovehoKlienta()

  const zmeny: { id: string; termin: string | null }[] = []

  for (const [pole, hodnota] of formData.entries()) {
    if (!pole.startsWith('termin:')) continue

    const id = pole.slice('termin:'.length)
    const zadano = typeof hodnota === 'string' ? hodnota.trim() : ''

    if (zadano && !TVAR_DATA.test(zadano)) {
      return { chyba: 'Některý termín není platné datum.' }
    }

    // Vyprázdněné pole termín ruší. Řádek zůstane, jen se přestane plánovat -
    // garant tak může úkon odložit, aniž by přišel o poslední provedení.
    const puvodni = formData.get(`puvodni:${id}`)
    const stary = typeof puvodni === 'string' ? puvodni : ''

    if (zadano !== stary) zmeny.push({ id, termin: zadano || null })
  }

  if (zmeny.length === 0) return { hotovo: 'Nic se nezměnilo.' }

  for (const zmena of zmeny) {
    const { error } = await supabase
      .from('plan_udrzby')
      .update({ dalsi_termin: zmena.termin })
      .eq('id', zmena.id)

    if (error) {
      return { chyba: `Termíny se nepodařilo uložit: ${error.message}` }
    }
  }

  revalidatePath(`/zarizeni/${zarizeniId}`)
  revalidatePath('/plan')

  const pocet = zmeny.length
  return {
    hotovo:
      pocet === 1 ? 'Termín uložen.' : `Uloženo ${pocet} ${pocet <= 4 ? 'termíny' : 'termínů'}.`,
  }
}
