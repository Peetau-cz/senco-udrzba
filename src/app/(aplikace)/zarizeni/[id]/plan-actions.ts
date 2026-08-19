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

  // Naplánovat hned, ne až noční úlohou. Termín zadaný na dnešek znamená
  // „dneska se to má udělat", ne „zítra o tom začneme uvažovat" - a garant,
  // který právě uložil plán, čeká, že je plán živý.
  //
  // Chyba plánovače se nehlásí jako selhání uložení: termíny v databázi jsou
  // a noční úloha zakázky stejně založí. Věta o tom, kolik jich vzniklo, se
  // v takovém případě prostě nepřipojí.
  const { data: naplanovano } = await supabase.rpc('naplanuj_zarizeni', {
    p_zarizeni: zarizeniId,
  })

  revalidatePath(`/zarizeni/${zarizeniId}`)
  revalidatePath('/plan')

  return { hotovo: `${popisUlozeni(zmeny.length)} ${popisNaplanovani(naplanovano ?? 0)}` }
}

function popisUlozeni(pocet: number): string {
  if (pocet === 1) return 'Termín uložen.'
  if (pocet <= 4) return `Uloženy ${pocet} termíny.`
  return `Uloženo ${pocet} termínů.`
}

/**
 * Nula je tu důležitá informace, ne mlčení: termín dál než čtrnáct dnů je
 * v pořádku a zakázka na něj vzniknout nemá. Bez téhle věty by to vypadalo,
 * že se uložení nepovedlo.
 */
function popisNaplanovani(pocet: number): string {
  if (pocet === 0) return 'Nic není splatné v nejbližších 14 dnech, zakázka zatím nevznikla.'
  if (pocet === 1) return 'Naplánován 1 úkon.'
  if (pocet <= 4) return `Naplánovány ${pocet} úkony.`
  return `Naplánováno ${pocet} úkonů.`
}
