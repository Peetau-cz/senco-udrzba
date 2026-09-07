/**
 * Kódy číselníků.
 *
 * Kód je klíč, přes který se záznam páruje v seedech a v případném importu
 * (docs/PRIPRAVA_DAT.md). Uživatel ho nezadává - odvodí se z názvu, aby
 * obrazovka měla jedno políčko místo dvou. Zůstává ale viditelný, protože až se
 * bude nahrávat struktura z Excelu, budou se řádky párovat právě přes něj.
 *
 * Sjednocené odsud, protože totéž potřebují tři číselníky s různým zvykem na
 * velikost písmen: umístění velkými (`HALA_2`), druhy zásahu a oblasti malými
 * (`vymena_zarovky`, `cnc`). Rozdíl je jen v tom písmenu, zbytek byl třikrát
 * tentýž kód.
 *
 * Bez závislosti na Reactu i na Supabase, aby šel testovat samostatně.
 */

/** Delší kód by se nevešel do sloupců, které s ním počítají. */
export const MAX_DELKA_KODU = 40

/** Malými píše většina číselníků, velkými jen umístění. */
export type TvarKodu = 'male' | 'velke'

/** Rozložená diakritika, kterou po sobě nechá normalizace NFD. */
const DIAKRITIKA = /[̀-ͯ]/g

/**
 * „Výměna žárovky" → `vymena_zarovky`, „Hala 2" velkými → `HALA_2`.
 *
 * Název bez jediného písmene a číslice kód nedá - vrací prázdný řetězec
 * a volající to musí ošetřit hláškou, ne uložením prázdného kódu.
 */
export function odvozKod(nazev: string, tvar: TvarKodu = 'male'): string {
  const bezDiakritiky = nazev.normalize('NFD').replace(DIAKRITIKA, '')
  const sjednocene = tvar === 'velke' ? bezDiakritiky.toUpperCase() : bezDiakritiky.toLowerCase()

  return orizni(
    sjednocene
      .replace(tvar === 'velke' ? /[^A-Z0-9]+/g : /[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, ''),
  )
}

/**
 * Přidá pořadové číslo, dokud kód někdo nemá. Používá se, když si dva názvy po
 * očištění sednou na stejný kód („Linka A" a „Linka-A").
 */
export function volnyKod(zaklad: string, obsazene: readonly string[] = []): string {
  if (!zaklad) return ''

  const zabrane = new Set(obsazene)
  if (!zabrane.has(zaklad)) return zaklad

  for (let poradi = 2; poradi < 100; poradi += 1) {
    const pripona = `_${poradi}`
    const kandidat = zaklad.slice(0, MAX_DELKA_KODU - pripona.length) + pripona
    if (!zabrane.has(kandidat)) return kandidat
  }

  return ''
}

/** Zkrácení může padnout doprostřed slova - podtržítko na konci by pak zbylo. */
function orizni(kod: string): string {
  return kod.slice(0, MAX_DELKA_KODU).replace(/_+$/g, '')
}
