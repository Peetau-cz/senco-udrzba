/**
 * Co se v auditovaném řádku změnilo.
 *
 * Trigger `audit_zmeny()` (migrace 0001) ukládá celý řádek před změnou i po ní.
 * Tenhle soubor z těch dvou snímků spočítá seznam změněných polí - obrazovka
 * pak ukazuje rozdíl, ne dvě stěny JSONu.
 *
 * Pojmenování sloupců a formátování hodnot sem NEPATŘÍ, to je práce pro
 * `popisky.ts`. Tady se jen porovnává; výsledkem jsou technické názvy sloupců
 * a syrové hodnoty.
 *
 * Bez závislosti na Reactu a Supabase, aby šel soubor testovat samostatně
 * (rozdil.test.ts).
 */

export type Operace = 'INSERT' | 'UPDATE' | 'DELETE'

export type ZmenaPole = {
  sloupec: string
  pred: unknown
  po: unknown
}

export type Snimek = Record<string, unknown> | null

/**
 * Sloupce, které se do rozdílu nikdy nepromítnou.
 *
 * `zmeneno_at` se mění při každé úpravě a přehlušil by to podstatné; čas změny
 * je stejně v hlavičce záznamu. `id` a `vytvoreno_at` patří k identitě řádku,
 * ne ke změně - `id` je navíc v nadpisu.
 */
const SKRYTE_SLOUPCE: ReadonlySet<string> = new Set(['id', 'vytvoreno_at', 'zmeneno_at'])

/**
 * Porovnání hodnotou, ne odkazem.
 *
 * Hodnoty z JSONB (kontrolní body, parametry zařízení) jsou objekty a pole.
 * Dva obsahově shodné objekty by při porovnání odkazem vypadaly jako změna
 * pokaždé, když se řádek uloží. Klíče se před porovnáním třídí, protože na
 * jejich pořadí v JSONB nezáleží.
 */
function stejne(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === null || b === null || a === undefined || b === undefined) return false
  if (typeof a !== 'object' || typeof b !== 'object') return false

  return serializuj(a) === serializuj(b)
}

function serializuj(hodnota: unknown): string {
  return JSON.stringify(hodnota, (_klic, h: unknown) => {
    if (h === null || typeof h !== 'object' || Array.isArray(h)) return h

    return Object.fromEntries(
      Object.entries(h as Record<string, unknown>).sort(([x], [y]) => x.localeCompare(y)),
    )
  })
}

/** Prázdná hodnota se vypisuje jako `null`, ať přišla odkudkoli. */
function hodnota(snimek: Snimek, sloupec: string): unknown {
  const h = snimek?.[sloupec]

  return h === undefined ? null : h
}

/**
 * Změněná pole mezi dvěma snímky řádku.
 *
 * Založení vypíše vyplněná pole nového řádku, smazání vyplněná pole toho
 * zaniklého. U změny se vrací jen to, co se opravdu liší - a prázdný seznam je
 * platný výsledek: uživatel mohl formulář odeslat beze změny.
 *
 * Sloupce se berou ze sjednocení obou snímků, aby se poznal i sloupec, který
 * v tom starším ještě neexistoval. Schéma se za běhu systému mění a starý
 * auditní záznam o pozdější migraci nic neví.
 */
export function spoctiRozdil(operace: Operace, stary: Snimek, novy: Snimek): ZmenaPole[] {
  const sloupce = [...new Set([...Object.keys(stary ?? {}), ...Object.keys(novy ?? {})])]
  const zmeny: ZmenaPole[] = []

  for (const sloupec of sloupce) {
    if (SKRYTE_SLOUPCE.has(sloupec)) continue

    const pred = operace === 'INSERT' ? null : hodnota(stary, sloupec)
    const po = operace === 'DELETE' ? null : hodnota(novy, sloupec)

    if (stejne(pred, po)) continue

    zmeny.push({ sloupec, pred, po })
  }

  return zmeny
}
