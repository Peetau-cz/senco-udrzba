/**
 * Jediné místo, kde se chyby SQL Serveru překládají pro uživatele.
 *
 * Dřív měla každá serverová akce vlastní `prelozChybu` nad kódy PostgreSQL
 * (23505, 42501, …) - deset kopií téhož. SQL Server hlásí chyby čísly, která
 * jsou stejná v každém jazyce serveru, takže se rozhoduje podle čísla, ne
 * podle anglického textu. Jediné, co se z textu čte, je název omezení
 * v uvozovkách - i ten je ve všech jazycích stejný.
 *
 * Vlastní `THROW` z triggerů a procedur mají pevnou řadu (docs/NASAZENI.md):
 *   50001–50099  nemáte oprávnění         (dřív errcode 42501)
 *   50100–50199  porušené pravidlo, česká věta jde uživateli doslova (23514)
 *   50200–50299  záznam neexistuje        (23503)
 *   50300–50399  neplatný argument        (22023)
 */

export type DruhChyby =
  | 'duplicita'
  | 'cizi_klic'
  | 'kontrola'
  | 'opravneni'
  | 'pravidlo'
  | 'nenalezeno'
  | 'neplatny_argument'
  | 'prilis_dlouhe'
  | 'jina'

export type RozpoznanaChyba = {
  druh: DruhChyby
  /** Číslo chyby SQL Serveru; null, když nešlo o chybu databáze. */
  cislo: number | null
  /** Název omezení nebo indexu, pokud ho hláška nese. */
  omezeni?: string
  /** Původní text hlášky. U vlastních THROW je to česká věta pro uživatele. */
  zprava: string
}

/** Věty konkrétního formuláře. Co chybí, dostane obecnou větu. */
export type TextyChyb = {
  /** Podle názvu omezení (`profil_email_idx`), `vychozi` pro ostatní. */
  duplicita?: Record<string, string>
  cizi_klic?: string
  kontrola?: string
  opravneni?: string
  nenalezeno?: string
}

const NATIVNI: Record<number, DruhChyby> = {
  2627: 'duplicita', // porušení UNIQUE / PRIMARY KEY omezení
  2601: 'duplicita', // duplicitní řádek v unikátním indexu
  547: 'cizi_klic', // FK nebo CHECK - upřesní se podle názvu omezení
  229: 'opravneni', // chybí právo na objekt
  230: 'opravneni', // chybí právo na sloupec
  33504: 'opravneni', // BLOCK predikát RLS odmítl zápis
  2628: 'prilis_dlouhe',
  8152: 'prilis_dlouhe', // starší číslo téhož
}

function druhVlastni(cislo: number): DruhChyby | null {
  if (cislo >= 50001 && cislo <= 50099) return 'opravneni'
  if (cislo >= 50100 && cislo <= 50199) return 'pravidlo'
  if (cislo >= 50200 && cislo <= 50299) return 'nenalezeno'
  if (cislo >= 50300 && cislo <= 50399) return 'neplatny_argument'
  return null
}

/** Texty v jednoduchých i dvojitých uvozovkách, v pořadí výskytu. */
function kvotovane(zprava: string): string[] {
  return [...zprava.matchAll(/'([^']+)'|"([^"]+)"/g)].map((m) => m[1] ?? m[2] ?? '')
}

export function rozpoznejChybu(chyba: unknown): RozpoznanaChyba {
  const zprava =
    chyba instanceof Error ? chyba.message : typeof chyba === 'string' ? chyba : String(chyba)
  const cislo =
    typeof chyba === 'object' &&
    chyba !== null &&
    typeof (chyba as { number?: unknown }).number === 'number'
      ? (chyba as { number: number }).number
      : null

  if (cislo === null) return { druh: 'jina', cislo, zprava }

  const vlastni = druhVlastni(cislo)
  if (vlastni) return { druh: vlastni, cislo, zprava }

  const druh = NATIVNI[cislo]
  if (!druh) return { druh: 'jina', cislo, zprava }

  const tokeny = kvotovane(zprava)

  if (druh === 'duplicita') {
    // 2627: první v uvozovkách je omezení. 2601: první je objekt, druhý index.
    const omezeni = cislo === 2601 ? (tokeny[1] ?? tokeny[0]) : tokeny[0]
    return { druh, cislo, omezeni, zprava }
  }

  if (cislo === 547) {
    const omezeni = tokeny[0]
    const jeKontrola = omezeni?.toLowerCase().startsWith('ck_') || /\bCHECK\b/.test(zprava)
    return { druh: jeKontrola ? 'kontrola' : 'cizi_klic', cislo, omezeni, zprava }
  }

  return { druh, cislo, zprava }
}

const VYCHOZI = {
  duplicita: 'Takový záznam už existuje.',
  cizi_klic: 'Záznam se používá jinde a nejde smazat.',
  kontrola: 'Hodnota neodpovídá pravidlům.',
  opravneni: 'Na tuhle akci nemáte oprávnění.',
  nenalezeno: 'Záznam neexistuje - možná ho někdo mezitím smazal.',
  prilis_dlouhe: 'Některý text je příliš dlouhý.',
}

export function prelozChybu(chyba: unknown, texty: TextyChyb): string {
  const r = rozpoznejChybu(chyba)
  const jeVlastni = r.cislo !== null && r.cislo >= 50001 && r.cislo <= 50399

  switch (r.druh) {
    case 'duplicita':
      return (
        (r.omezeni && texty.duplicita?.[r.omezeni]) ?? texty.duplicita?.vychozi ?? VYCHOZI.duplicita
      )
    case 'cizi_klic':
      return texty.cizi_klic ?? VYCHOZI.cizi_klic
    case 'kontrola':
      return texty.kontrola ?? VYCHOZI.kontrola
    case 'opravneni':
      // Vlastní THROW už říká proč (jen garant, jen technik oblasti…).
      return jeVlastni ? r.zprava : (texty.opravneni ?? VYCHOZI.opravneni)
    case 'pravidlo':
    case 'neplatny_argument':
      return r.zprava
    case 'nenalezeno':
      return jeVlastni ? r.zprava : (texty.nenalezeno ?? VYCHOZI.nenalezeno)
    case 'prilis_dlouhe':
      return VYCHOZI.prilis_dlouhe
    case 'jina':
      return `Uložení se nepovedlo: ${r.zprava}`
  }
}

/**
 * Odmítnutý zápis RLS nehlásí - FILTER predikát řádek prostě nevidí a UPDATE
 * změní nula řádků. Nula změněných řádků je tedy „nemáte oprávnění" (nebo
 * záznam mezitím zmizel), ne úspěch. BLOCK predikát naproti tomu hlásí 33504,
 * to chytá `prelozChybu`.
 *
 * Kysely vrací počet jako bigint (`numUpdatedRows`).
 */
export function overZmenu(pocet: bigint | number | undefined, hlaska: string): string | null {
  if (pocet === undefined) return hlaska
  return BigInt(pocet) > 0n ? null : hlaska
}
