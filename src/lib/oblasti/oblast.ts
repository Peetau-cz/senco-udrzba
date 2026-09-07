/**
 * Pravidla číselníku oblastí údržby (zadání ř. 20-36, modul M6).
 *
 * Bez závislosti na Reactu i na Supabase, aby šel soubor testovat samostatně
 * (oblast.test.ts). Skutečnou hranicí zůstává databáze - politiky z migrace
 * 0001 a cizí klíče platí i pro volání API napřímo; tohle je kvůli hláškám.
 */

import type { Database } from '@/types/database.types'

export type VztahKOblasti = Database['public']['Enums']['vztah_k_oblasti']

export type ClovekVOblasti = {
  id: string
  celeJmeno: string
  vztah: VztahKOblasti
  /** Vyřazená osoba oblast nepokrývá, i když u ní pořád visí. */
  aktivni: boolean
}

/** Co na oblasti visí. Rozhoduje o tom, jestli půjde smazat. */
export type PoctyOblasti = {
  zarizeni: number
  typy: number
  sablony: number
}

const MAX_DELKA_NAZVU = 100

export function overNazevOblasti(nazev: string): string | null {
  const ocisteny = nazev.trim()

  if (!ocisteny) return 'Zadejte název oblasti.'
  if (ocisteny.length > MAX_DELKA_NAZVU) return 'Název oblasti je příliš dlouhý.'

  return null
}

/**
 * Má oblast někoho, kdo za ni odpovídá?
 *
 * Vyřazená osoba se nepočítá schválně. Garant, který ve firmě skončil, oblast
 * nepokrývá - a právě tuhle díru má správce na obrazovce vidět, protože z ní
 * plyne, že restance nemá komu chodit. Spolupracující garanta nenahradí:
 * zadání (ř. 32-36) je u lakovny rozlišuje záměrně.
 */
export function maAktivnihoGaranta(lide: readonly ClovekVOblasti[]): boolean {
  return lide.some((c) => c.vztah === 'garant' && c.aktivni)
}

/**
 * Garanti nahoru, vyřazení dolů, ve skupině abecedně.
 *
 * Řadí kopii - volající předává pole z dotazu a překreslení seznamu nemá měnit
 * data pod rukama.
 */
export function seradLidiOblasti(lide: readonly ClovekVOblasti[]): ClovekVOblasti[] {
  return [...lide].sort((a, b) => {
    if (a.vztah !== b.vztah) return a.vztah === 'garant' ? -1 : 1
    if (a.aktivni !== b.aktivni) return a.aktivni ? -1 : 1

    return a.celeJmeno.localeCompare(b.celeJmeno, 'cs')
  })
}

/**
 * Proč oblast nejde smazat, nebo `null`, když jde.
 *
 * Drží ji cizí klíče s `on delete restrict` ze `zarizeni`, `typ_zarizeni`
 * a `sablona` (migrace 0003 a 0006). Lidé v seznamu nechybí omylem - vazbu
 * `uzivatel_oblast` ruší `on delete cascade`, takže mazání nebrání.
 *
 * Tlačítko, které vždycky skončí chybou, je horší než žádné, proto stránka
 * podle tohohle rovnou ukáže důvod. Poslední slovo má stejně databáze.
 */
export function duvodNelzeSmazat(pocty: PoctyOblasti): string | null {
  const casti = [
    pocty.zarizeni > 0 ? `${pocty.zarizeni} ${sklonuj(pocty.zarizeni, ZARIZENI)}` : null,
    pocty.typy > 0 ? `${pocty.typy} ${sklonuj(pocty.typy, TYPY)}` : null,
    pocty.sablony > 0 ? `${pocty.sablony} ${sklonuj(pocty.sablony, SABLONY)}` : null,
  ].filter((c): c is string => c !== null)

  if (casti.length === 0) return null

  return `váže ${spoj(casti)}`
}

/** [1, 2-4, 5 a víc] - tvary, které čeština u počtů rozlišuje. */
type Tvary = readonly [string, string, string]

const ZARIZENI: Tvary = ['zařízení', 'zařízení', 'zařízení']
const TYPY: Tvary = ['typ zařízení', 'typy zařízení', 'typů zařízení']
const SABLONY: Tvary = ['šablonu', 'šablony', 'šablon']

function sklonuj(pocet: number, tvary: Tvary): string {
  if (pocet === 1) return tvary[0]
  if (pocet < 5) return tvary[1]

  return tvary[2]
}

/** „a" před posledním, čárky mezi zbytkem. */
function spoj(casti: readonly string[]): string {
  const posledni = casti.at(-1) ?? ''
  if (casti.length === 1) return posledni

  return `${casti.slice(0, -1).join(', ')} a ${posledni}`
}
