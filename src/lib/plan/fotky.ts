/**
 * Fotodokumentace provedené údržby (zadání ř. 129).
 *
 * Pravidla jsou tu proto, aby technik dostal srozumitelnou hlášku dřív, než
 * pošle deset megabajtů z tabletu po firemní wifi. Skutečnou hranicí zůstává
 * úložiště: velikost i seznam typů jsou nastavené i na nádobě v migraci 0012,
 * takže volání API napřímo je neobejde.
 *
 * Proti přílohám zařízení tu chybí PDF. Fotka z checklistu je doklad o tom, jak
 * stroj vypadal - dokument sem nepatří a nikdo by ho v historii nečekal.
 *
 * Bez závislosti na Reactu, Supabase i webových API, aby šel soubor testovat
 * samostatně (fotky.test.ts).
 */

/** 10 MB, stejně jako u příloh zařízení. Táž hodnota je na nádobě v migraci 0012. */
export const MAX_VELIKOST_FOTKY_B = 10 * 1024 * 1024

/**
 * Jen formáty, které prohlížeč umí zobrazit. HEIC z iPadu mezi nimi schválně
 * není - Safari ho při odeslání přes formulářové pole sám převádí na JPEG.
 */
export const POVOLENE_TYPY_FOTEK: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

export const PRIJIMANE_PRIPONY_FOTEK = '.jpg,.jpeg,.png,.webp'

export type PopisFotky = {
  velikost: number
  mime: string
}

/** Vrací hlášku pro uživatele, nebo null když je vše v pořádku. */
export function overFotku(fotka: PopisFotky): string | null {
  if (fotka.velikost === 0) return 'Fotka je prázdná.'

  if (fotka.velikost > MAX_VELIKOST_FOTKY_B) {
    return `Fotka je větší než ${Math.round(MAX_VELIKOST_FOTKY_B / 1024 / 1024)} MB.`
  }

  if (!POVOLENE_TYPY_FOTEK[fotka.mime]) {
    return 'Přijímáme jen obrázky JPG, PNG a WEBP.'
  }

  return null
}

/**
 * Cesta k fotce v úložišti: `<id zakazky>/<nahodnost>.<pripona>`.
 *
 * První složka je id ZAKÁZKY, ne kroku, i když fotka visí na kroku. Politiky
 * v migraci 0012 podle ní rozhodují o přístupu a mělčí cesta pro ně znamená
 * jeden join místo dvou.
 */
export function cestaFotky(zakazkaId: string, mime: string, nahodnost: string): string {
  const pripona = POVOLENE_TYPY_FOTEK[mime] ?? 'bin'
  return `${zakazkaId}/${nahodnost}.${pripona}`
}
