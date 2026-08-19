'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { nactiPrihlaseneho } from '@/lib/auth/session'
import { prectiBody } from '@/lib/sablony/kontrolni-body'
import { radkyNaUkony, type RadekUkonu } from '@/lib/sablony/matice'
import { vytvorServerovehoKlienta } from '@/lib/supabase/server'

export type StavFormulareSablony = {
  chyba?: string
  chybyPoli?: Record<string, string>
}

export type StavMatice = {
  chyba?: string
  /** Chyby úkonů podle pořadí řádku v editoru. */
  chybyUkonu?: Record<number, string>
  hotovo?: string
}

const KOD = /^[a-z][a-z0-9_]*$/

const schemaSablony = z.object({
  nazev: z.string().trim().min(1, 'Zadejte název šablony').max(120, 'Název je příliš dlouhý'),
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
 * Založí nebo přejmenuje šablonu.
 *
 * Oprávnění nekontroluje - rozhodují politiky sablona_insert a sablona_update
 * z migrace 0006, tedy role garanta a jeho vazba na oblast.
 */
export async function ulozSablonu(
  id: string | null,
  _predchozi: StavFormulareSablony,
  formData: FormData,
): Promise<StavFormulareSablony> {
  const cti = precti(formData)

  const vstup = schemaSablony.safeParse({
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

  const supabase = await vytvorServerovehoKlienta()

  if (id === null) {
    const { data, error } = await supabase.from('sablona').insert(vstup.data).select('id').single()

    if (error) return prelozChybu(error)

    revalidatePath('/sablony')
    redirect(`/sablony/${data.id}`)
  }

  // Kód se po založení nemění - je to trvalý identifikátor, na který se
  // odkazuje CSV import (P6). Oblast taky ne: šablona už může být přiřazená
  // zařízením a složený cizí klíč by přesun stejně nepustil.
  const { nazev, popis, aktivni } = vstup.data
  const { data, error } = await supabase
    .from('sablona')
    .update({ nazev, popis, aktivni })
    .eq('id', id)
    .select('id')

  if (error) return prelozChybu(error)

  if ((data ?? []).length === 0) {
    return { chyba: 'Šablonu se nepodařilo uložit — nemáte právo měnit tuto oblast.' }
  }

  revalidatePath('/sablony')
  revalidatePath(`/sablony/${id}`)
  redirect(`/sablony/${id}`)
}

/**
 * Otevře novou verzi k úpravám.
 *
 * Volá funkci v databázi, protože založení návrhu je víc kroků v jedné
 * transakci - vznik verze a kopie právě platné matice. Existující návrh vrátí
 * beze změny, takže opakované kliknutí nic nerozbije.
 */
export async function zalozNavrh(sablonaId: string): Promise<void> {
  const supabase = await vytvorServerovehoKlienta()

  const { error } = await supabase.rpc('zaloz_navrh_verze', { p_sablona_id: sablonaId })

  if (error) throw new Error(`Návrh verze se nepodařilo založit: ${error.message}`)

  revalidatePath(`/sablony/${sablonaId}`)
  redirect(`/sablony/${sablonaId}?zalozka=matice`)
}

/**
 * Uloží matici návrhu.
 *
 * Úkony se nepárují po jednom, ale celá matice se přepíše - garant řádky
 * přidává, maže i přesouvá a dohledávat, co je které, by bylo křehčí než to
 * napsat znovu. Aktivované verze se to netýká, tu zamkne trigger z migrace 0006.
 *
 * Smazání a vložení jsou dva dotazy, supabase-js transakci neumí. Vložení je
 * ale jedno volání pro celé pole, takže projde buď celé, nebo vůbec - nejhorší
 * možný konec je prázdný NÁVRH, ne poškozená historie. Formulář zůstane
 * vyplněný a jde odeslat znovu.
 */
export async function ulozMatici(
  sablonaId: string,
  verzeId: string,
  _predchozi: StavMatice,
  formData: FormData,
): Promise<StavMatice> {
  const radky = prectiRadky(formData)
  if (radky === null) {
    return { chyba: 'Matici se nepodařilo přečíst. Zkuste stránku načíst znovu.' }
  }

  const { ukony, chyby } = radkyNaUkony(radky)
  if (Object.keys(chyby).length > 0) {
    return { chybyUkonu: chyby }
  }

  const supabase = await vytvorServerovehoKlienta()

  const { error: chybaMazani } = await supabase
    .from('sablona_ukon')
    .delete()
    .eq('sablona_verze_id', verzeId)

  if (chybaMazani) return prelozChybuMatice(chybaMazani)

  if (ukony.length > 0) {
    const { error: chybaVlozeni } = await supabase
      .from('sablona_ukon')
      .insert(ukony.map((ukon) => ({ ...ukon, sablona_verze_id: verzeId })))

    if (chybaVlozeni) return prelozChybuMatice(chybaVlozeni)
  }

  revalidatePath(`/sablony/${sablonaId}`)
  return { hotovo: `Matice uložena, ${ukony.length} úkonů.` }
}

/**
 * Aktivuje návrh.
 *
 * Zase funkce v databázi: archivace dosavadní verze a aktivace nové musí být
 * jedna transakce, jinak by šablona mohla zůstat bez platné verze.
 */
export async function aktivujVerzi(sablonaId: string, verzeId: string): Promise<void> {
  const supabase = await vytvorServerovehoKlienta()

  const { error } = await supabase.rpc('aktivuj_verzi', { p_verze_id: verzeId })

  if (error) throw new Error(`Verzi se nepodařilo aktivovat: ${error.message}`)

  revalidatePath(`/sablony/${sablonaId}`)
  revalidatePath('/sablony')
  redirect(`/sablony/${sablonaId}?zalozka=verze`)
}

/** Zahodí rozdělaný návrh. Aktivovanou verzi smazat nejde, brání tomu trigger. */
export async function zahodNavrh(sablonaId: string, verzeId: string): Promise<void> {
  const supabase = await vytvorServerovehoKlienta()

  const { error } = await supabase.from('sablona_verze').delete().eq('id', verzeId)

  if (error) throw new Error(`Návrh se nepodařilo zahodit: ${error.message}`)

  revalidatePath(`/sablony/${sablonaId}`)
  redirect(`/sablony/${sablonaId}?zalozka=verze`)
}

/**
 * Přiřadí šablonu vybraným zařízením.
 *
 * Zadání (ř. 98-106) chce jednu šablonu nad více stroji stejného typu, proto
 * se přiřazuje hromadně, ne po jednom. `oblast_id` je v řádku kvůli složenému
 * cizímu klíči, který hlídá, že stroj i šablona jsou ze stejné oblasti.
 */
export async function prirazZarizeni(
  sablonaId: string,
  oblastId: string,
  formData: FormData,
): Promise<void> {
  const vybrana = formData
    .getAll('zarizeni')
    .filter((h): h is string => typeof h === 'string' && h !== '')

  if (vybrana.length === 0) {
    redirect(`/sablony/${sablonaId}?zalozka=zarizeni`)
  }

  const uzivatel = await nactiPrihlaseneho()
  const supabase = await vytvorServerovehoKlienta()

  const { error } = await supabase.from('zarizeni_sablona').upsert(
    vybrana.map((zarizeniId) => ({
      zarizeni_id: zarizeniId,
      sablona_id: sablonaId,
      oblast_id: oblastId,
      prirazil_id: uzivatel?.id ?? null,
    })),
    { onConflict: 'zarizeni_id,sablona_id', ignoreDuplicates: true },
  )

  if (error) throw new Error(`Přiřazení se nepodařilo: ${error.message}`)

  revalidatePath(`/sablony/${sablonaId}`)
  redirect(`/sablony/${sablonaId}?zalozka=zarizeni`)
}

export async function odeberZarizeni(sablonaId: string, zarizeniId: string): Promise<void> {
  const supabase = await vytvorServerovehoKlienta()

  const { error } = await supabase
    .from('zarizeni_sablona')
    .delete()
    .eq('sablona_id', sablonaId)
    .eq('zarizeni_id', zarizeniId)

  if (error) throw new Error(`Odebrání se nepodařilo: ${error.message}`)

  revalidatePath(`/sablony/${sablonaId}`)
}

/**
 * Řádky editoru chodí jako JSON v jednom skrytém poli. Stejně jako u parametrů
 * typu zařízení: pole pojmenovaná `ukon[0][nazev]` se špatně skládají zpět a
 * při mazání řádku se rozjedou indexy.
 */
function prectiRadky(formData: FormData): RadekUkonu[] | null {
  const surove = formData.get('ukony')
  if (typeof surove !== 'string') return []

  try {
    const rozebrane = JSON.parse(surove)
    if (!Array.isArray(rozebrane)) return null

    return rozebrane.map((r) => ({
      // Stálý klíč úkonu. Přijde z editoru zpátky beze změny, u nového řádku
      // je prázdný - viz RadekUkonu v matice.ts.
      klic: text(r?.klic),
      nazev: text(r?.nazev),
      popis: text(r?.popis),
      interval_typ: text(r?.interval_typ),
      interval_hodnota: text(r?.interval_hodnota),
      interval_zaklad: text(r?.interval_zaklad),
      tolerance_dny: text(r?.tolerance_dny),
      profese_role_id: text(r?.profese_role_id),
      // JSON z prohlížeče je cizí vstup jako každý jiný - prectiBody z něj
      // vezme jen to, co má tvar, zbytek zahodí.
      kontrolni_body: prectiBody(r?.kontrolni_body),
      vyzaduje_foto: r?.vyzaduje_foto === true,
      vyzaduje_hodnotu: r?.vyzaduje_hodnotu === true,
      nabizi_poznamku: r?.nabizi_poznamku === true,
      jednotka: text(r?.jednotka),
      mez_min: text(r?.mez_min),
      mez_max: text(r?.mez_max),
    }))
  } catch {
    return null
  }
}

function text(hodnota: unknown): string {
  return typeof hodnota === 'string' ? hodnota : ''
}

function prelozChybu(chyba: { code?: string; message: string }): StavFormulareSablony {
  if (chyba.code === '23505') {
    return { chybyPoli: { kod: 'Šablona s tímto kódem už existuje.' } }
  }
  if (chyba.code === '42501') {
    return { chyba: 'Nemáte oprávnění spravovat šablony v této oblasti.' }
  }
  if (chyba.code === '23514') {
    return { chyba: chyba.message }
  }

  return { chyba: `Uložení selhalo: ${chyba.message}` }
}

function prelozChybuMatice(chyba: { code?: string; message: string }): StavMatice {
  if (chyba.code === '42501') {
    return { chyba: 'Nemáte oprávnění měnit tuto šablonu.' }
  }
  // Zámek aktivované verze hlásí vlastní srozumitelnou větu, tu stojí za to
  // ukázat tak, jak přišla z databáze.
  if (chyba.code === '23514') {
    return { chyba: chyba.message }
  }

  return { chyba: `Uložení matice selhalo: ${chyba.message}` }
}
