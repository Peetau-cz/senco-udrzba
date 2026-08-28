/**
 * Pravidla pro osoby a jejich karty.
 *
 * Od migrace 0024 znamená `profil` osobu, ne účet. Většina lidí v dílně mail
 * nemá a nikdy se nepřihlásí - zato má osobní číslo a kartu na turniket.
 * Formulář se tomu musí přizpůsobit: povinné je jen jméno.
 */

export const MAX_DELKA_JMENA = 60
export const MAX_DELKA_OSOBNIHO_CISLA = 30
export const MAX_DELKA_KARTY = 60

export type UdajeOsoby = {
  jmeno: string
  prijmeni: string
  osobniCislo: string | null
  email: string | null
}

/** Prázdný text z formuláře znamená „nevyplněno", ne prázdný řetězec. */
export function textNeboNull(hodnota: FormDataEntryValue | null): string | null {
  if (typeof hodnota !== 'string') return null
  const orezany = hodnota.trim()
  return orezany === '' ? null : orezany
}

export function textNeboPrazdny(hodnota: FormDataEntryValue | null): string {
  return typeof hodnota === 'string' ? hodnota.trim() : ''
}

/**
 * Číslo z karty chodí ze čtečky, která se chová jako klávesnice - občas s
 * mezerou navíc, občas malými písmeny. Porovnání v databázi je přesné, takže
 * se tvar musí srovnat tady, a stejně při párování i při identifikaci.
 */
export function normalizujCisloKarty(cislo: string): string {
  return cislo.trim().toUpperCase()
}

/**
 * Vrátí chybu k zobrazení, nebo null když je vyplnění v pořádku.
 *
 * Mail je volitelný. Když ale vyplněný je, znamená to, že ten člověk dostane
 * přihlášení - a pak musí být k něčemu doručitelný, takže se aspoň hrubě
 * ověří tvar. Skutečné ověření dělá Supabase Auth při zakládání účtu.
 */
export function overOsobu(udaje: UdajeOsoby): string | null {
  const jmeno = udaje.jmeno.trim()
  const prijmeni = udaje.prijmeni.trim()

  if (!jmeno && !prijmeni) return 'Zadejte jméno nebo příjmení.'
  if (jmeno.length > MAX_DELKA_JMENA) return 'Jméno je příliš dlouhé.'
  if (prijmeni.length > MAX_DELKA_JMENA) return 'Příjmení je příliš dlouhé.'

  if (udaje.osobniCislo && udaje.osobniCislo.length > MAX_DELKA_OSOBNIHO_CISLA) {
    return 'Osobní číslo je příliš dlouhé.'
  }

  if (udaje.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(udaje.email)) {
    return 'E-mail nemá platný tvar. Nechte pole prázdné, pokud se ten člověk nepřihlašuje.'
  }

  return null
}

export function overCisloKarty(cislo: string): string | null {
  const normalizovane = normalizujCisloKarty(cislo)

  if (!normalizovane) return 'Přiložte kartu ke čtečce, nebo číslo napište.'
  if (normalizovane.length > MAX_DELKA_KARTY) return 'Číslo karty je příliš dlouhé.'

  return null
}

/**
 * Jak se osoba pojmenuje v seznamech.
 *
 * Řetěz náhrad je delší než jinde schválně: lidé z dílny nemají mail, takže
 * jako záchrana nestačí - musí za ním stát osobní číslo.
 */
export function celeJmeno(udaje: Partial<UdajeOsoby>): string {
  const jmeno = [udaje.jmeno, udaje.prijmeni]
    .map((c) => c?.trim() ?? '')
    .filter(Boolean)
    .join(' ')

  return jmeno || udaje.email?.trim() || udaje.osobniCislo?.trim() || 'bez jména'
}
