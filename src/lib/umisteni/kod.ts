/**
 * Kódy umístění.
 *
 * Kód je klíč, přes který se umístění odkazují v importu (`umisteni.csv`
 * v docs/PRIPRAVA_DAT.md) a v seedech. Uživatel ho nezadává - odvodí se z názvu,
 * aby obrazovka měla jedno políčko místo dvou. Zůstává ale viditelný, protože až
 * se bude nahrávat struktura z Excelu, budou se řádky párovat právě přes něj.
 *
 * Bez závislosti na Reactu i na Supabase, aby šel testovat samostatně.
 */

const MAX_DELKA = 40

/**
 * „Hala 2" → `HALA_2`, „Linka B" pod halou → `HALA_2_LINKA_B`.
 *
 * Kód nadřazeného umístění se předsazuje schválně: v hale 1 i v hale 2 může být
 * Linka B a obojí musí projít, protože kód je v databázi jedinečný.
 */
export function kodUmisteni(nazev: string, kodNadrazeneho?: string | null): string {
  const zaklad = nazev
    .normalize('NFD')
    // Rozložená diakritika po normalizaci NFD.
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

  if (!zaklad) return ''

  const cely = kodNadrazeneho ? `${kodNadrazeneho}_${zaklad}` : zaklad

  return cely.slice(0, MAX_DELKA).replace(/_+$/g, '')
}

/**
 * Přidá pořadové číslo, dokud kód někdo nemá. Používá se, když si dva provozy
 * po očištění názvu sednou na stejný kód („Linka A" a „Linka-A").
 */
export function volnyKod(zaklad: string, obsazene: readonly string[]): string {
  if (!zaklad) return ''

  const zabrane = new Set(obsazene)
  if (!zabrane.has(zaklad)) return zaklad

  for (let poradi = 2; poradi < 100; poradi++) {
    const pripona = `_${poradi}`
    const kandidat = zaklad.slice(0, MAX_DELKA - pripona.length) + pripona
    if (!zabrane.has(kandidat)) return kandidat
  }

  return ''
}
