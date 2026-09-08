import { cache } from 'react'
import { vytvorServerovehoKlienta } from '@/lib/supabase/server'
import { KODY_ROLI, type KodRole } from '@/lib/auth/opravneni'

export type Oblast = {
  id: string
  kod: string
  nazev: string
}

export type PrihlasenyUzivatel = {
  /**
   * Id OSOBY (profil.id), ne id účtu. Od migrace 0024 to nejsou tytéž hodnoty:
   * účet je jen jedna z vlastností osoby a spousta lidí ho vůbec nemá.
   * Do sloupců jako dokoncil_id nebo provedl_id patří tohle.
   */
  id: string
  email: string
  jmeno: string
  prijmeni: string
  celeJmeno: string
  role: KodRole[]
  /** Oblasti, které uživatel smí vidět. Filtruje je RLS, ne aplikace. */
  oblasti: Oblast[]
}

function jeKodRole(kod: string): kod is KodRole {
  return (KODY_ROLI as readonly string[]).includes(kod)
}

/**
 * Načte přihlášeného uživatele včetně rolí a dostupných oblastí.
 *
 * Seznam oblastí se nefiltruje v aplikaci - dotaz na tabulku `oblast` vrátí
 * rovnou jen ty, na které má uživatel právo, protože politika oblast_select
 * volá ma_pristup_k_oblasti(). Specialista tak dostane svou oblast, vedoucí
 * údržby a management všech pět.
 *
 * Obaleno v cache(), takže při jednom požadavku proběhne dotaz jen jednou,
 * i když si o uživatele řekne layout i stránka.
 */
export const nactiPrihlaseneho = cache(async (): Promise<PrihlasenyUzivatel | null> => {
  const supabase = await vytvorServerovehoKlienta()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  // Osobu hledáme podle účtu, ne podle rovnosti id. Role se ptáme až potom,
  // protože se váže na osobu - bez jejího id nemá dotaz co dosadit.
  const [profilVysledek, oblastiVysledek] = await Promise.all([
    supabase
      .from('profil')
      .select('id, jmeno, prijmeni, email')
      .eq('ucet_id', user.id)
      .maybeSingle(),
    supabase.from('oblast').select('id, kod, nazev').eq('aktivni', true).order('poradi'),
  ])

  // Účet bez osoby je porucha, ne stav, ve kterém se dá pracovat: nešlo by
  // podepsat jediný záznam. Stejně to vidí i aktualni_uzivatel() v databázi.
  const profil = profilVysledek.data
  if (!profil) return null

  const roleVysledek = await supabase
    .from('uzivatel_role')
    .select('role(kod)')
    .eq('uzivatel_id', profil.id)

  const jmeno = profil.jmeno ?? ''
  const prijmeni = profil.prijmeni ?? ''

  // Vnořený dotaz vrací u vazby N:1 jeden objekt, ne pole.
  const role = (roleVysledek.data ?? [])
    .map((radek) => radek.role?.kod)
    .filter((kod): kod is string => typeof kod === 'string')
    .filter(jeKodRole)

  return {
    id: profil.id,
    email: profil.email ?? user.email ?? '',
    jmeno,
    prijmeni,
    celeJmeno: [jmeno, prijmeni].filter(Boolean).join(' ') || (user.email ?? ''),
    role,
    oblasti: oblastiVysledek.data ?? [],
  }
})

/**
 * Id přihlášené osoby pro sloupce typu `dokoncil_id`, `nahral_id` nebo `provedl_id`.
 *
 * Serverové akce si ho dřív braly ze `supabase.auth.getUser()`. Od migrace 0024
 * to vrací id ÚČTU, což je jiná hodnota než id osoby, a cizí klíč do profilu by
 * na ni spadl. Dotaz navíc nevzniká, nactiPrihlaseneho je v cache().
 *
 * Vrací null, když nikdo přihlášený není - volající to má ohlásit, ne zapsat.
 */
export async function idPrihlaseneOsoby(): Promise<string | null> {
  return (await nactiPrihlaseneho())?.id ?? null
}
