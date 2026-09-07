/**
 * Kódy umístění.
 *
 * Odvození z názvu i číslování při shodě jsou společné všem číselníkům a bydlí
 * v `@/lib/ciselniky/kod`. Tady zůstává jen to, čím se umístění liší: velká
 * písmena a předsazený kód nadřazeného umístění.
 */

import { MAX_DELKA_KODU, odvozKod } from '@/lib/ciselniky/kod'

/**
 * „Hala 2" → `HALA_2`, „Linka B" pod halou → `HALA_2_LINKA_B`.
 *
 * Kód nadřazeného umístění se předsazuje schválně: v hale 1 i v hale 2 může být
 * Linka B a obojí musí projít, protože kód je v databázi jedinečný.
 */
export function kodUmisteni(nazev: string, kodNadrazeneho?: string | null): string {
  const zaklad = odvozKod(nazev, 'velke')
  if (!zaklad) return ''

  const cely = kodNadrazeneho ? `${kodNadrazeneho}_${zaklad}` : zaklad

  return cely.slice(0, MAX_DELKA_KODU).replace(/_+$/g, '')
}
