import { cache } from 'react'
import { vytvorServerovehoKlienta } from '@/lib/supabase/server'
import { KODY_ROLI, type KodRole } from '@/lib/auth/opravneni'

export type Oblast = {
  id: string
  kod: string
  nazev: string
}

export type PrihlasenyUzivatel = {
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

  const [profilVysledek, roleVysledek, oblastiVysledek] = await Promise.all([
    supabase.from('profil').select('jmeno, prijmeni, email').eq('id', user.id).single(),
    supabase.from('uzivatel_role').select('role(kod)').eq('uzivatel_id', user.id),
    supabase.from('oblast').select('id, kod, nazev').eq('aktivni', true).order('poradi'),
  ])

  const jmeno = profilVysledek.data?.jmeno ?? ''
  const prijmeni = profilVysledek.data?.prijmeni ?? ''

  // Vnořený dotaz vrací u vazby N:1 jeden objekt, ne pole.
  const role = (roleVysledek.data ?? [])
    .map((radek) => radek.role?.kod)
    .filter((kod): kod is string => typeof kod === 'string')
    .filter(jeKodRole)

  return {
    id: user.id,
    email: profilVysledek.data?.email ?? user.email ?? '',
    jmeno,
    prijmeni,
    celeJmeno: [jmeno, prijmeni].filter(Boolean).join(' ') || (user.email ?? ''),
    role,
    oblasti: oblastiVysledek.data ?? [],
  }
})
