'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { vytvorServerovehoKlienta } from '@/lib/supabase/server'
import { radkyNaSchema, type RadekParametru } from '@/lib/zarizeni/schema-typu'

export type StavFormulareTypu = {
  chyba?: string
  chybyPoli?: Record<string, string>
  /** Chyby parametrů podle pořadí řádku v editoru. */
  chybyParametru?: Record<number, string>
}

const KOD = /^[a-z][a-z0-9_]*$/

const schemaTypu = z.object({
  nazev: z.string().trim().min(1, 'Zadejte název typu').max(100, 'Název je příliš dlouhý'),
  kod: z
    .string()
    .trim()
    .min(1, 'Zadejte kód')
    .max(40, 'Kód je příliš dlouhý')
    .regex(KOD, 'Kód smí mít jen malá písmena bez diakritiky, číslice a podtržítka'),
  oblast_id: z.string().uuid('Vyberte oblast údržby'),
  popis: z
    .string()
    .nullish()
    .transform((v) => (v ?? '').trim())
    .transform((v) => (v === '' ? null : v)),
  aktivni: z.boolean(),
})

function precti(formData: FormData) {
  return (pole: string) => {
    const hodnota = formData.get(pole)
    return typeof hodnota === 'string' ? hodnota : null
  }
}

/**
 * Řádky editoru chodí jako JSON v jednom skrytém poli.
 *
 * Alternativou by byla pole pojmenovaná `parametr[0][klic]`, ale ta se špatně
 * skládají zpět a při mazání řádku se rozjedou indexy. JSON je jednodušší a
 * stejně bezpečný - celý se znovu ověřuje na serveru.
 */
function prectiRadky(formData: FormData): RadekParametru[] | null {
  const surove = formData.get('parametry')
  if (typeof surove !== 'string') return []

  try {
    const rozebrane = JSON.parse(surove)
    if (!Array.isArray(rozebrane)) return null

    return rozebrane.map((r) => ({
      klic: typeof r?.klic === 'string' ? r.klic : '',
      popisek: typeof r?.popisek === 'string' ? r.popisek : '',
      typ: r?.typ === 'cislo' || r?.typ === 'ano_ne' || r?.typ === 'vyber' ? r.typ : 'text',
      jednotka: typeof r?.jednotka === 'string' ? r.jednotka : '',
      povinne: r?.povinne === true,
      moznosti: typeof r?.moznosti === 'string' ? r.moznosti : '',
    }))
  } catch {
    return null
  }
}

/**
 * Založí nebo upraví typ zařízení včetně definice vlastních parametrů.
 *
 * Oprávnění nekontroluje - rozhodují politiky typ_zarizeni_insert a
 * typ_zarizeni_update z migrace 0003, tedy role garanta a jeho vazba na oblast.
 */
export async function ulozTyp(
  id: string | null,
  _predchozi: StavFormulareTypu,
  formData: FormData,
): Promise<StavFormulareTypu> {
  const cti = precti(formData)

  const vstup = schemaTypu.safeParse({
    nazev: cti('nazev') ?? '',
    kod: cti('kod') ?? '',
    oblast_id: cti('oblast_id') ?? '',
    popis: cti('popis'),
    aktivni: cti('aktivni') !== null,
  })

  if (!vstup.success) {
    const chybyPoli: Record<string, string> = {}
    for (const problem of vstup.error.issues) {
      const pole = String(problem.path[0] ?? '')
      if (pole && !chybyPoli[pole]) chybyPoli[pole] = problem.message
    }
    return { chybyPoli }
  }

  const radky = prectiRadky(formData)
  if (radky === null) {
    return { chyba: 'Parametry se nepodařilo přečíst. Zkuste stránku načíst znovu.' }
  }

  const { schema, chyby } = radkyNaSchema(radky)
  if (Object.keys(chyby).length > 0) {
    return { chybyParametru: chyby }
  }

  const supabase = await vytvorServerovehoKlienta()
  const zaznam = { ...vstup.data, schema_parametru: schema }

  if (id === null) {
    const { data, error } = await supabase.from('typ_zarizeni').insert(zaznam).select('id').single()

    if (error) return prelozChybu(error)

    revalidatePath('/zarizeni/typy')
    redirect(`/zarizeni/typy/${data.id}`)
  }

  // Kód se po založení nemění - je to trvalý identifikátor typu, na který se
  // odkazují seedy i případný import. Přejmenovat jde název, ne kód.
  const { nazev, popis, aktivni, schema_parametru } = zaznam
  const { data, error } = await supabase
    .from('typ_zarizeni')
    .update({ nazev, popis, aktivni, schema_parametru })
    .eq('id', id)
    .select('id')

  if (error) return prelozChybu(error)

  if ((data ?? []).length === 0) {
    return { chyba: 'Typ se nepodařilo uložit — nemáte právo měnit tuto oblast.' }
  }

  revalidatePath('/zarizeni/typy')
  revalidatePath(`/zarizeni/typy/${id}`)
  redirect(`/zarizeni/typy/${id}`)
}

function prelozChybu(chyba: { code?: string; message: string }): StavFormulareTypu {
  if (chyba.code === '23505') {
    return { chybyPoli: { kod: 'Typ s tímto kódem už existuje.' } }
  }
  if (chyba.code === '42501') {
    return { chyba: 'Nemáte oprávnění spravovat typy v této oblasti.' }
  }
  if (chyba.code === '23514') {
    return { chyba: chyba.message }
  }

  return { chyba: `Uložení selhalo: ${chyba.message}` }
}
