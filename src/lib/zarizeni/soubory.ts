/**
 * Soubory ke kartě zařízení - fotky, návody, certifikáty (zadání ř. 95).
 *
 * Pravidla jsou tu proto, aby uživatel dostal srozumitelnou hlášku dřív, než
 * pošle deset megabajtů po firemní síti. Skutečnou hranicí zůstává úložiště:
 * omezení velikosti i seznam typů jsou nastavené i na nádobě v migraci 0004,
 * takže volání API napřímo je neobejde.
 *
 * Bez závislosti na Reactu, Supabase i webových API, aby šel soubor testovat
 * samostatně (soubory.test.ts).
 */

export const DRUHY_SOUBORU = [
  { hodnota: 'foto', popisek: 'Fotka', mnozne: 'Fotky' },
  { hodnota: 'navod', popisek: 'Návod', mnozne: 'Návody' },
  { hodnota: 'certifikat', popisek: 'Certifikát', mnozne: 'Certifikáty' },
] as const

export type DruhSouboru = (typeof DRUHY_SOUBORU)[number]['hodnota']

export function jeDruhSouboru(hodnota: string): hodnota is DruhSouboru {
  return DRUHY_SOUBORU.some((d) => d.hodnota === hodnota)
}

export function popisekDruhu(druh: string): string {
  return DRUHY_SOUBORU.find((d) => d.hodnota === druh)?.popisek ?? druh
}

/** 10 MB. Stejná hodnota je na nádobě v migraci 0004. */
export const MAX_VELIKOST_B = 10 * 1024 * 1024

/** Přípona slouží jen k pojmenování v úložišti; o typu rozhoduje MIME. */
export const POVOLENE_TYPY: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
}

export const PRIJIMANE_PRIPONY = '.jpg,.jpeg,.png,.webp,.pdf'

export type PopisSouboru = {
  nazev: string
  velikost: number
  mime: string
}

/**
 * Ověří soubor proti pravidlům. Vrací hlášku pro uživatele, nebo null když je
 * vše v pořádku.
 */
export function overSoubor(soubor: PopisSouboru): string | null {
  if (soubor.velikost === 0) {
    return 'Soubor je prázdný.'
  }

  if (soubor.velikost > MAX_VELIKOST_B) {
    return `Soubor je větší než ${formatVelikost(MAX_VELIKOST_B)} (má ${formatVelikost(soubor.velikost)}).`
  }

  if (!POVOLENE_TYPY[soubor.mime]) {
    return 'Přijímáme jen obrázky (JPG, PNG, WEBP) a PDF.'
  }

  return null
}

/**
 * Název, pod kterým soubor leží v úložišti.
 *
 * Původní jméno se do cesty nepromítá schválně - diakritika, mezery a lomítka
 * v názvech typu „Návod k obsluze (rev. 2)/final.pdf" dělají v klíčích úložiště
 * potíže. Jméno pro uživatele se ukládá do sloupce `nazev` v databázi, kde
 * nevadí vůbec nic.
 */
export function cestaSouboru(zarizeniId: string, mime: string, nahodnost: string): string {
  const pripona = POVOLENE_TYPY[mime] ?? 'bin'
  return `${zarizeniId}/${nahodnost}.${pripona}`
}

/** Zkrátí příliš dlouhý název, ale nechá poznat příponu. */
export function zkratNazev(nazev: string, maximum = 80): string {
  const cisty = nazev.trim().replace(/[\r\n\t]/g, ' ')
  if (cisty.length <= maximum) return cisty

  const tecka = cisty.lastIndexOf('.')
  const pripona = tecka > 0 && cisty.length - tecka <= 6 ? cisty.slice(tecka) : ''
  return cisty.slice(0, maximum - pripona.length - 1) + '…' + pripona
}

export function formatVelikost(bajty: number | null | undefined): string {
  if (bajty === null || bajty === undefined) return '—'
  if (bajty < 1024) return `${bajty} B`

  const kb = bajty / 1024
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0).replace('.', ',')} kB`

  const mb = kb / 1024
  return `${mb.toFixed(mb < 10 ? 1 : 0).replace('.', ',')} MB`
}

export function jeObrazek(mime: string | null | undefined): boolean {
  return typeof mime === 'string' && mime.startsWith('image/')
}
