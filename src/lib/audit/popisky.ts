/**
 * České názvy a lidsky čitelné hodnoty pro auditní log.
 *
 * Audit čte i management, ne jen správce. Bez téhle vrstvy by na obrazovce
 * stálo `planovany_termin: "2026-08-20" → "2026-08-27"`, což je pravda, ale
 * ne odpověď na otázku „kdo co změnil".
 *
 * ZÁSADA: měkký dopad. Co v mapě není, se vypíše technickým názvem - nikdy se
 * nezamlčí a nikdy se kvůli tomu nespadne. Schéma se za běhu mění a mapa bude
 * občas pozadu; audit tím zestárne, ale nepřestane platit.
 *
 * Sloupce se pojmenovávají globálně, ne podle tabulky: schéma je v tomhle
 * důsledné, `nazev` znamená všude totéž. Kdyby někdy nezačalo, přibude sem
 * výjimka pro jednu tabulku, ne druhá mapa pro všechny.
 *
 * Bez závislosti na Reactu a Supabase, aby šel soubor testovat samostatně
 * (popisky.test.ts).
 */

import { formatDatum, formatDatumCas } from '@/lib/datum'

/** Devatenáct tabulek, které mají auditní trigger (migrace 0001-0020). */
const TABULKY: Record<string, string> = {
  oblast: 'Oblast',
  role: 'Role',
  umisteni: 'Umístění',
  profil: 'Uživatel',
  uzivatel_role: 'Přiřazení role',
  uzivatel_oblast: 'Přiřazení oblasti',
  typ_zarizeni: 'Typ zařízení',
  zarizeni: 'Zařízení',
  zarizeni_soubor: 'Příloha zařízení',
  sablona: 'Šablona',
  sablona_verze: 'Verze šablony',
  sablona_ukon: 'Úkon šablony',
  zarizeni_sablona: 'Přiřazení šablony',
  plan_udrzby: 'Plán údržby',
  zakazka: 'Zakázka',
  zakazka_ukon: 'Krok zakázky',
  druh_zasahu: 'Druh zásahu',
  provozni_denik: 'Zápis v deníku',
  denik_foto: 'Fotka v deníku',
}

const SLOUPCE: Record<string, string> = {
  nazev: 'Název',
  popis: 'Popis',
  poznamka: 'Poznámka',
  stav: 'Stav',
  aktivni: 'Aktivní',
  poradi: 'Pořadí',
  kod: 'Kód',
  hodnota: 'Hodnota',
  jednotka: 'Jednotka',
  druh: 'Druh',
  vztah: 'Vztah',

  jmeno: 'Jméno',
  prijmeni: 'Příjmení',
  email: 'E-mail',
  osobni_cislo: 'Osobní číslo',

  inventarni_cislo: 'Inventární číslo',
  vyrobce: 'Výrobce',
  model: 'Model',
  vyrobni_cislo: 'Výrobní číslo',
  rok_vyroby: 'Rok výroby',
  parametry: 'Parametry',

  planovany_termin: 'Plánovaný termín',
  prvni_termin: 'První termín',
  posledni_provedeni: 'Poslední provedení',
  interval_typ: 'Typ intervalu',
  interval_hodnota: 'Hodnota intervalu',
  interval_zaklad: 'Základ intervalu',
  tolerance_dny: 'Tolerance ve dnech',
  cislo_verze: 'Číslo verze',
  platna_od: 'Platná od',
  poznamka_ke_zmene: 'Poznámka ke změně',
  kontrolni_body: 'Kontrolní body',
  vyzaduje_foto: 'Vyžaduje fotku',
  vyzaduje_hodnotu: 'Vyžaduje hodnotu',
  nabizi_poznamku: 'Nabízí poznámku',
  mez_min: 'Dolní mez',
  mez_max: 'Horní mez',
  doba_trvani_min: 'Doba trvání',
  provedeno_at: 'Provedeno',
  provedl: 'Provedl',

  oblast_id: 'Oblast',
  zarizeni_id: 'Zařízení',
  umisteni_id: 'Umístění',
  typ_zarizeni_id: 'Typ zařízení',
  sablona_id: 'Šablona',
  sablona_verze_id: 'Verze šablony',
  role_id: 'Role',
  uzivatel_id: 'Uživatel',
  profese_role_id: 'Profese',
  druh_zasahu_id: 'Druh zásahu',
  prirazeno_uzivateli_id: 'Přiřazeno',
  dokoncil_id: 'Dokončil',
  potvrdil_id: 'Potvrdil',
  nadrazene_id: 'Nadřazené',

  zahajeno_at: 'Zahájeno',
  dokonceno_at: 'Dokončeno',
  potvrzeno_at: 'Potvrzeno',
}

/**
 * Hodnoty výčtů ze schématu. Jedna společná mapa stačí - žádná hodnota se
 * napříč výčty neopakuje, takže není potřeba vědět, ze kterého sloupce přišla.
 */
const HODNOTY: Record<string, string> = {
  garant: 'garant',
  spolupracujici: 'spolupracující',

  v_provozu: 'v provozu',
  odstaveno: 'odstaveno',
  v_oprave: 'v opravě',
  vyrazeno: 'vyřazeno',

  foto: 'fotka',
  navod: 'návod',
  certifikat: 'certifikát',

  navrh: 'návrh',
  aktivni: 'aktivní',
  archivovana: 'archivovaná',

  dny: 'dny',
  tydny: 'týdny',
  mesice: 'měsíce',
  roky: 'roky',

  od_provedeni: 'od provedení',
  od_planu: 'od plánu',

  naplanovano: 'naplánováno',
  probiha: 'probíhá',
  dokonceno: 'dokončeno',
  zruseno: 'zrušeno',

  nesplneno: 'nesplněno',
  splneno: 'splněno',
  nelze_provest: 'nelze provést',
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATUM = /^\d{4}-\d{2}-\d{2}$/

/** Nabídka do filtru „čeho se změna týkala", setříděná podle českého názvu. */
export const AUDITOVANE_TABULKY: readonly { tabulka: string; popis: string }[] = Object.entries(
  TABULKY,
)
  .map(([tabulka, popis]) => ({ tabulka, popis }))
  .sort((a, b) => a.popis.localeCompare(b.popis, 'cs'))

export function popisTabulky(tabulka: string): string {
  return TABULKY[tabulka] ?? tabulka
}

/**
 * Přípona `_snapshot` se zahazuje: zakázka i její kroky si zamrazují hodnoty
 * ze šablony, ale pro čtenáře je to pořád „Název", ne „Název snapshot".
 */
export function popisSloupce(sloupec: string): string {
  const holy = sloupec.replace(/_snapshot$/, '')

  return SLOUPCE[holy] ?? holy
}

/**
 * Jak se záznamu říká v nadpisu - „Soustruh SV-18" místo klíče.
 *
 * Bere se ze snímku řádku, který audit uložil, takže to nestojí ani jeden dotaz
 * navíc. Pořadí je od nejvýmluvnějšího: vlastní název, pak stroj, ke kterému
 * řádek patří (tak se pojmenuje zakázka, plán i krok checklistu), pak jméno
 * osoby. Když nic z toho, zbude zkrácený klíč - záznam se nikdy neztratí.
 */
export function nadpisZaznamu(
  snimek: Record<string, unknown> | null,
  zaznamId: string,
  jmena?: ReadonlyMap<string, string>,
): string {
  const text = (klic: string): string | null => {
    const h = snimek?.[klic]
    return typeof h === 'string' && h.trim() !== '' ? h : null
  }

  const nazev = text('nazev') ?? text('nazev_snapshot')
  if (nazev) return nazev

  const stroj = text('zarizeni_id')
  const jmenoStroje = stroj ? jmena?.get(stroj) : null
  if (jmenoStroje) return jmenoStroje

  const osoba = [text('jmeno'), text('prijmeni')].filter(Boolean).join(' ').trim()
  if (osoba) return osoba

  return UUID.test(zaznamId) ? `${zaznamId.slice(0, 8)}…` : zaznamId
}

/**
 * Hodnota tak, jak se ukáže na obrazovce.
 *
 * `jmena` je mapa klíč → jméno, kterou si stránka načte jednou pro všechny
 * záznamy (profily, oblasti, zařízení). Klíč, který v ní není, se zkrátí -
 * nezmizí, ale ani nerozbije řádek na šířku obrazovky.
 */
export function popisHodnoty(
  hodnota: unknown,
  sloupec: string,
  jmena?: ReadonlyMap<string, string>,
): string {
  if (hodnota === null || hodnota === undefined) return '—'
  if (typeof hodnota === 'boolean') return hodnota ? 'ano' : 'ne'
  if (typeof hodnota === 'number') return String(hodnota)

  if (typeof hodnota === 'object') return JSON.stringify(hodnota)

  if (typeof hodnota !== 'string') return String(hodnota)

  if (UUID.test(hodnota)) return jmena?.get(hodnota) ?? `${hodnota.slice(0, 8)}…`
  if (DATUM.test(hodnota)) return formatDatum(hodnota)
  if (sloupec.endsWith('_at')) return formatDatumCas(hodnota)

  return HODNOTY[hodnota] ?? hodnota
}
