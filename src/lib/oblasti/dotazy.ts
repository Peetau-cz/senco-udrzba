import {
  seradLidiOblasti,
  type ClovekVOblasti,
  type PoctyOblasti,
  type VztahKOblasti,
} from '@/lib/oblasti/oblast'
import { celeJmeno } from '@/lib/osoby/osoba'
import { vytvorServerovehoKlienta } from '@/lib/supabase/server'

export type Oblast = {
  id: string
  kod: string
  nazev: string
  poradi: number
  aktivni: boolean
  lide: ClovekVOblasti[]
  pocty: PoctyOblasti
}

/**
 * Jeden dotaz místo čtyř: osazenstvo i počty vazeb se dotahují vnořeně.
 *
 * Počty jsou tu kvůli mazání - oblast drží cizí klíče s `on delete restrict`
 * ze `zarizeni`, `typ_zarizeni` a `sablona`, takže stránka musí vědět, co na ní
 * visí, dřív než nabídne tlačítko.
 *
 * Politika `oblast_select` pouští na cizí oblasti jen administrátora, vedoucího
 * údržby a management. Právo `ciselniky` má z nich administrátor a vedoucí, což
 * jsou zrovna ti, kdo vidí všechny - seznam tedy nebude nikdy díravý.
 */
const VYBER = `
  id, kod, nazev, poradi, aktivni,
  uzivatel_oblast(vztah, profil(id, jmeno, prijmeni, email, osobni_cislo, aktivni)),
  zarizeni(count),
  typ_zarizeni(count),
  sablona(count)
`

type ProfilVOblasti = {
  id: string
  jmeno: string
  prijmeni: string
  email: string | null
  osobni_cislo: string | null
  aktivni: boolean
}

type RadekOblasti = {
  id: string
  kod: string
  nazev: string
  poradi: number
  aktivni: boolean
  uzivatel_oblast: { vztah: VztahKOblasti; profil: ProfilVOblasti | null }[] | null
  zarizeni: { count: number }[] | null
  typ_zarizeni: { count: number }[] | null
  sablona: { count: number }[] | null
}

function slozOblast(radek: RadekOblasti): Oblast {
  const lide = (radek.uzivatel_oblast ?? [])
    .filter((v) => v.profil !== null)
    .map((v) => ({
      id: v.profil!.id,
      celeJmeno: celeJmeno({
        jmeno: v.profil!.jmeno,
        prijmeni: v.profil!.prijmeni,
        email: v.profil!.email,
        osobniCislo: v.profil!.osobni_cislo,
      }),
      vztah: v.vztah,
      aktivni: v.profil!.aktivni,
    }))

  return {
    id: radek.id,
    kod: radek.kod,
    nazev: radek.nazev,
    poradi: radek.poradi,
    aktivni: radek.aktivni,
    lide: seradLidiOblasti(lide),
    pocty: {
      zarizeni: radek.zarizeni?.[0]?.count ?? 0,
      typy: radek.typ_zarizeni?.[0]?.count ?? 0,
      sablony: radek.sablona?.[0]?.count ?? 0,
    },
  }
}

export async function nactiOblasti(): Promise<Oblast[]> {
  const supabase = await vytvorServerovehoKlienta()

  const { data } = await supabase.from('oblast').select(VYBER).order('poradi')

  return (data ?? []).map(slozOblast)
}

/**
 * Co je v číselníku obsazené, když se zakládá nová oblast.
 *
 * Kódy kvůli tomu, aby si dvě oblasti nesedly na tentýž; názvy proto, že dvě
 * oblasti stejného jména s kódy `cnc` a `cnc_2` jsou překlep, ne záměr.
 */
export async function nactiObsazeneOblasti(): Promise<{
  kody: string[]
  nazvy: string[]
  posledniPoradi: number
}> {
  const supabase = await vytvorServerovehoKlienta()

  const { data } = await supabase.from('oblast').select('kod, nazev, poradi')

  return {
    kody: (data ?? []).map((o) => o.kod),
    nazvy: (data ?? []).map((o) => o.nazev),
    posledniPoradi: Math.max(0, ...(data ?? []).map((o) => o.poradi)),
  }
}
