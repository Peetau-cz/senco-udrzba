import { celeJmeno } from '@/lib/osoby/osoba'
import { vytvorServerovehoKlienta } from '@/lib/supabase/server'
import type { Database } from '@/types/database.types'

export type VztahKOblasti = Database['public']['Enums']['vztah_k_oblasti']

export type RoleOsoby = { id: string; kod: string; nazev: string }
export type OblastOsoby = { id: string; kod: string; nazev: string; vztah: VztahKOblasti }
export type KartaOsoby = { id: string; cislo: string; aktivni: boolean }

export type Osoba = {
  id: string
  jmeno: string
  prijmeni: string
  celeJmeno: string
  osobniCislo: string | null
  email: string | null
  /** Přihlašuje se? Většina lidí v dílně ne - a je to tak správně. */
  maUcet: boolean
  /** Kiosek je účet zařízení, ne člověka. V seznamu patří zvlášť. */
  jeKiosek: boolean
  aktivni: boolean
  role: RoleOsoby[]
  oblasti: OblastOsoby[]
  karty: KartaOsoby[]
}

/**
 * Jeden dotaz místo čtyř: role, oblasti i karty se dotahují vnořeně.
 *
 * Karty vidí jen administrátor a vedoucí údržby (politika karta_select), takže
 * komu na ně právo není, tomu se prostě vrátí prázdné pole - dotaz kvůli tomu
 * nespadne a stránka se nemusí ptát dvakrát.
 */
const VYBER = `
  id, jmeno, prijmeni, osobni_cislo, email, ucet_id, aktivni,
  uzivatel_role(role(id, kod, nazev)),
  uzivatel_oblast(vztah, oblast(id, kod, nazev)),
  karta(id, cislo, aktivni)
`

type RadekOsoby = {
  id: string
  jmeno: string
  prijmeni: string
  osobni_cislo: string | null
  email: string | null
  ucet_id: string | null
  aktivni: boolean
  uzivatel_role: { role: RoleOsoby | null }[] | null
  uzivatel_oblast: { vztah: VztahKOblasti; oblast: Omit<OblastOsoby, 'vztah'> | null }[] | null
  karta: KartaOsoby[] | null
}

function slozOsobu(radek: RadekOsoby): Osoba {
  const role = (radek.uzivatel_role ?? [])
    .map((r) => r.role)
    .filter((r): r is RoleOsoby => r !== null)
    .sort((a, b) => a.nazev.localeCompare(b.nazev, 'cs'))

  const oblasti = (radek.uzivatel_oblast ?? [])
    .filter((o) => o.oblast !== null)
    .map((o) => ({ ...o.oblast!, vztah: o.vztah }))
    .sort((a, b) => a.nazev.localeCompare(b.nazev, 'cs'))

  return {
    id: radek.id,
    jmeno: radek.jmeno,
    prijmeni: radek.prijmeni,
    celeJmeno: celeJmeno({
      jmeno: radek.jmeno,
      prijmeni: radek.prijmeni,
      email: radek.email,
      osobniCislo: radek.osobni_cislo,
    }),
    osobniCislo: radek.osobni_cislo,
    email: radek.email,
    maUcet: radek.ucet_id !== null,
    jeKiosek: role.some((r) => r.kod === 'kiosek'),
    aktivni: radek.aktivni,
    role,
    oblasti,
    // Vyřazené karty až za aktivními - hledá se v nich jen výjimečně.
    karty: (radek.karta ?? []).sort((a, b) => Number(b.aktivni) - Number(a.aktivni)),
  }
}

export async function nactiOsoby(): Promise<Osoba[]> {
  const supabase = await vytvorServerovehoKlienta()

  const { data } = await supabase
    .from('profil')
    .select(VYBER)
    .order('prijmeni')
    .order('jmeno')

  return (data ?? []).map(slozOsobu)
}

export async function nactiOsobu(id: string): Promise<Osoba | null> {
  const supabase = await vytvorServerovehoKlienta()

  const { data } = await supabase
    .from('profil')
    .select(VYBER)
    .eq('id', id)
    .maybeSingle()

  return data ? slozOsobu(data) : null
}

/** Nabídky do formulářů. Role je zároveň profese, podle které plánovač řadí úkony. */
export async function nactiCiselnikyOsob() {
  const supabase = await vytvorServerovehoKlienta()

  const [role, oblasti] = await Promise.all([
    supabase.from('role').select('id, kod, nazev, popis').order('poradi'),
    supabase.from('oblast').select('id, kod, nazev').eq('aktivni', true).order('poradi'),
  ])

  return {
    role: role.data ?? [],
    oblasti: oblasti.data ?? [],
  }
}
