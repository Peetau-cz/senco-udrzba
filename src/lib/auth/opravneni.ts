/**
 * Matice oprávnění z docs/NAVRH.md kap. 3.1.
 *
 * DŮLEŽITÉ: tento soubor rozhoduje jen o tom, co uživatel VIDÍ v rozhraní.
 * Skutečnou autoritou je Row Level Security v databázi (zásada R1). Kdyby se
 * obojí rozešlo, uživatel uvidí položku menu a dostane prázdný seznam - nikdy
 * ne cizí data.
 *
 * Soubor je záměrně bez závislosti na Reactu i na Supabase, aby šel testovat
 * samostatně (src/lib/auth/opravneni.test.ts).
 */

export const KODY_ROLI = [
  'administrator',
  'vedouci_udrzby',
  'specialista_cnc',
  'specialista_elektro',
  'udrzbar',
  'vedouci_lakovny',
  'pracovnik_skladu',
  'management',
  // Účet dotykového zařízení v dílně, ne člověk. Ve webové části nemá co
  // pohledávat - patří na /kiosek. Co smí v databázi, řeší migrace 0026.
  'kiosek',
] as const

export type KodRole = (typeof KODY_ROLI)[number]

export type Modul =
  | 'dashboard'
  | 'plan'
  | 'provedeni'
  | 'plneni'
  | 'zarizeni'
  | 'sablony'
  | 'denik'
  | 'historie'
  | 'uzivatele'
  | 'ciselniky'
  | 'audit'

export type Pravo = 'cteni' | 'zapis'

/**
 * Role, které nosí lidé. Kiosek je účet zařízení a webovou část nevidí, takže
 * „všechny role" znamená všechny lidské - jinak by se mu moduly přidávaly samy
 * pokaždé, když do matice přibude řádek.
 */
export const KODY_ROLI_LIDI: readonly KodRole[] = KODY_ROLI.filter((r) => r !== 'kiosek')

const VSECHNY: readonly KodRole[] = KODY_ROLI_LIDI

/** Management je podle zadání ř. 49 výhradně pro čtení. */
const BEZ_MANAGEMENTU: readonly KodRole[] = KODY_ROLI_LIDI.filter((r) => r !== 'management')

/** Garanti oblastí - spravují zařízení, šablony a plán ve své oblasti. */
const GARANTI: readonly KodRole[] = [
  'administrator',
  'vedouci_udrzby',
  'specialista_cnc',
  'specialista_elektro',
  'vedouci_lakovny',
  'pracovnik_skladu',
]

const SPRAVCI_CISELNIKU: readonly KodRole[] = ['administrator', 'vedouci_udrzby']

const MATICE: Record<Modul, { cteni: readonly KodRole[]; zapis: readonly KodRole[] }> = {
  dashboard: { cteni: VSECHNY, zapis: [] },
  plneni: { cteni: VSECHNY, zapis: [] },
  historie: { cteni: VSECHNY, zapis: [] },
  zarizeni: { cteni: VSECHNY, zapis: GARANTI },
  sablony: { cteni: VSECHNY, zapis: GARANTI },
  plan: { cteni: VSECHNY, zapis: GARANTI },
  provedeni: { cteni: BEZ_MANAGEMENTU, zapis: BEZ_MANAGEMENTU },
  denik: { cteni: VSECHNY, zapis: BEZ_MANAGEMENTU },
  uzivatele: { cteni: ['administrator'], zapis: ['administrator'] },
  ciselniky: { cteni: SPRAVCI_CISELNIKU, zapis: SPRAVCI_CISELNIKU },
  audit: { cteni: ['administrator', 'vedouci_udrzby', 'management'], zapis: [] },
}

/** Role s přístupem ke všem oblastem (zadání ř. 51). */
const ROLE_NAD_VSEMI_OBLASTMI: readonly KodRole[] = [
  'administrator',
  'vedouci_udrzby',
  'management',
]

export function maPravo(role: readonly KodRole[], modul: Modul, pravo: Pravo): boolean {
  return role.some((r) => MATICE[modul][pravo].includes(r))
}

export function maPristupKeVsemOblastem(role: readonly KodRole[]): boolean {
  return role.some((r) => ROLE_NAD_VSEMI_OBLASTMI.includes(r))
}

/** Smí uživatel vůbec něco zapisovat? Zrcadlí SQL funkci muze_zapisovat(). */
export function muzeZapisovat(role: readonly KodRole[]): boolean {
  return role.some((r) => r !== 'management')
}

export type PolozkaMenu = {
  modul: Modul
  href: string
  popisek: string
}

/** Pořadí odpovídá navigaci v docs/NAVRH.md kap. 4. */
const MENU: readonly PolozkaMenu[] = [
  { modul: 'dashboard', href: '/', popisek: 'Dashboard' },
  { modul: 'plan', href: '/plan', popisek: 'Plán údržby' },
  { modul: 'plneni', href: '/plneni', popisek: 'Plnění matice' },
  { modul: 'zarizeni', href: '/zarizeni', popisek: 'Zařízení' },
  { modul: 'sablony', href: '/sablony', popisek: 'Šablony' },
  { modul: 'denik', href: '/denik', popisek: 'Provozní deník' },
  { modul: 'uzivatele', href: '/nastaveni/uzivatele', popisek: 'Uživatelé' },
  { modul: 'ciselniky', href: '/nastaveni/oblasti', popisek: 'Číselníky' },
  // Umístění je číselník, proto se řídí stejným právem. Vlastní položku má
  // proto, že se do něj sahá mnohem častěji než do zbytku nastavení.
  { modul: 'ciselniky', href: '/nastaveni/umisteni', popisek: 'Umístění' },
  { modul: 'audit', href: '/audit', popisek: 'Audit' },
]

/** Položky menu, na které má uživatel alespoň právo čtení. */
export function polozkyMenu(role: readonly KodRole[]): PolozkaMenu[] {
  return MENU.filter((p) => maPravo(role, p.modul, 'cteni'))
}
