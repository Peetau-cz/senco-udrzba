/**
 * Převod filtru „od dne - do dne" na okamžiky, kterými se dá dotázat databáze.
 *
 * Uživatel volí dny, `audit_log.cas` je ale okamžik v UTC. Kdyby se datum
 * poslalo do dotazu tak, jak přišlo z formuláře, vzala by ho databáze jako
 * půlnoc UTC - tedy 2:00 pražského rána v létě a 1:00 v zimě. Ze zvoleného dne
 * by tiše vypadly noční zápisy a nikdo by si toho nevšiml podle vzoru, protože
 * chyba se v zimě a v létě liší.
 *
 * Bez závislosti na Reactu a Supabase, aby šel soubor testovat samostatně
 * (filtr.test.ts).
 */

// Obecná pomůcka, která dnes bydlí v deníku - je to jediné místo v projektu,
// kde se pražský čas převádí na okamžik. Kdyby přibyl třetí zájemce, zaslouží
// si přestěhovat do lib/datum.ts.
import { pragskyCasNaIso } from '@/lib/denik/zasah'

export type RozsahDnu = {
  odIso?: string
  doIso?: string
}

const DEN = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * Je to opravdu existující den?
 *
 * Samotný tvar nestačí: „2026-13-45" projde přes regulární výraz i přes
 * Date.UTC, které si přebytek tiše převede na únor příštího roku. Kontroluje se
 * proto, že se datum vrátí stejné, jaké přišlo.
 */
function naDatum(den: string): Date | null {
  const shoda = DEN.exec(den.trim())
  if (!shoda) return null

  const [rok, mesic, denVMesici] = [Number(shoda[1]), Number(shoda[2]), Number(shoda[3])]
  const datum = new Date(Date.UTC(rok, mesic - 1, denVMesici))

  const sedi =
    datum.getUTCFullYear() === rok &&
    datum.getUTCMonth() === mesic - 1 &&
    datum.getUTCDate() === denVMesici

  return sedi ? datum : null
}

function naDen(datum: Date): string {
  return datum.toISOString().slice(0, 10)
}

/**
 * Meze pro dotaz nad `audit_log.cas`.
 *
 * Dolní mez je půlnoc zvoleného dne v Praze, horní mez **půlnoc dne
 * následujícího** - horní mez se tedy porovnává ostře (`<`), jinak by ze
 * zvoleného dne vypadlo všechno kromě první vteřiny.
 *
 * Posun pásma se počítá pro každou mez zvlášť. U rozsahu, který přechází na
 * letní čas, je dolní mez ještě zimní a horní už letní.
 *
 * Nesmyslné datum se zahodí, místo aby se poslalo do databáze - filtr, kterému
 * uživatel špatně rozumí, nemá vracet záhadně prázdný seznam.
 */
export function rozsahDnu(od?: string, doDne?: string): RozsahDnu {
  const rozsah: RozsahDnu = {}

  const zacatek = od ? naDatum(od) : null
  if (zacatek) {
    const iso = pragskyCasNaIso(`${naDen(zacatek)}T00:00`)
    if (iso) rozsah.odIso = iso
  }

  const konec = doDne ? naDatum(doDne) : null
  if (konec) {
    const nasledujici = new Date(konec.getTime() + 24 * 60 * 60 * 1000)
    const iso = pragskyCasNaIso(`${naDen(nasledujici)}T00:00`)
    if (iso) rozsah.doIso = iso
  }

  return rozsah
}
