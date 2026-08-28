import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CreditCard, KeyRound, Monitor, Plus, UserRound } from 'lucide-react'
import { FormularOsoby } from '@/components/osoby/formulare-osoby'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { maPravo } from '@/lib/auth/opravneni'
import { nactiPrihlaseneho } from '@/lib/auth/session'
import { nactiOsoby, type Osoba } from '@/lib/osoby/dotazy'
import { zalozOsobu } from './actions'

export const metadata = { title: 'Uživatelé a role' }

/**
 * Správa osob.
 *
 * Od migrace 0024 znamená `profil` OSOBU, ne účet. Většina lidí v dílně mail
 * nemá, takže se nikdy nepřihlásí — a přesto musí v systému existovat, protože
 * na ně míří `dokoncil_id`, `provedl_id` i historie zařízení.
 *
 * Účty se odsud nezakládají: nežijí v našem schématu a sáhnout na ně by
 * znamenalo vzít si servisní klíč (zásada R1). Kdo se má přihlašovat, tomu
 * účet vytvoří administrátor v Supabase a trigger z migrace 0025 si ho k téhle
 * osobě podle mailu připojí sám.
 */
export default async function StrankaUzivatele() {
  const uzivatel = await nactiPrihlaseneho()
  if (!uzivatel) redirect('/login')
  if (!maPravo(uzivatel.role, 'uzivatele', 'cteni')) redirect('/')

  const osoby = await nactiOsoby()

  const lide = osoby.filter((o) => o.aktivni && !o.jeKiosek)
  const kiosky = osoby.filter((o) => o.aktivni && o.jeKiosek)
  const vyrazeni = osoby.filter((o) => !o.aktivni)

  const bezPrihlaseni = lide.filter((o) => !o.maUcet).length

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Uživatelé a role</h1>
        <p className="text-muted-foreground">
          Kdo v systému vystupuje. Přihlášení má jen ten, kdo má e-mail — dílna se prokazuje
          kartou u kiosku.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lidé</CardTitle>
          <CardDescription>
            {lide.length === 0
              ? 'Zatím tu není nikdo.'
              : `${pocetLidi(lide.length)}, z toho ${bezPrihlaseni} bez přihlášení.`}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {lide.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">Založte první osobu formulářem níž.</p>
          ) : (
            <ul className="divide-y rounded-md border">
              {lide.map((osoba) => (
                <RadekOsoby key={osoba.id} osoba={osoba} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {kiosky.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Monitor className="size-4" aria-hidden="true" />
              Kiosky
            </CardTitle>
            <CardDescription>
              Účty dotykových zařízení v dílně, ne lidé. Kdo u nich stojí, se pozná kartou.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <ul className="divide-y rounded-md border">
              {kiosky.map((osoba) => (
                <RadekOsoby key={osoba.id} osoba={osoba} />
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {vyrazeni.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Vyřazení</CardTitle>
            <CardDescription>
              V nabídkách se neobjevují a od kiosku se neprokážou. Jejich podpis u starších
              záznamů ale zůstal — historie se nepřepisuje.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <ul className="divide-y rounded-md border">
              {vyrazeni.map((osoba) => (
                <RadekOsoby key={osoba.id} osoba={osoba} />
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-primary/40">
        <CardHeader className="rounded-t-lg border-b border-primary/30 bg-primary/5">
          <CardTitle className="flex items-center gap-2 text-base">
            <Plus className="size-4 text-primary" aria-hidden="true" />
            Nová osoba
          </CardTitle>
          <CardDescription>
            Role, oblasti a kartu doplníte hned potom na jejím detailu.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <FormularOsoby akce={zalozOsobu} popisekTlacitka="Založit osobu" />
        </CardContent>
      </Card>
    </div>
  )
}

function RadekOsoby({ osoba }: { osoba: Osoba }) {
  const aktivniKaret = osoba.karty.filter((k) => k.aktivni).length

  return (
    <li>
      <Link
        href={`/nastaveni/uzivatele/${osoba.id}`}
        className="flex flex-wrap items-center gap-3 px-3 py-2.5 hover:bg-primary/5"
      >
        <div className="min-w-0 flex-1">
          <span className="font-medium">{osoba.celeJmeno}</span>
          <p className="flex flex-wrap items-center gap-2 pt-1 text-xs text-muted-foreground">
            {osoba.osobniCislo ? (
              <span className="stitek-razeny">{osoba.osobniCislo}</span>
            ) : null}
            <span>{popisRoli(osoba)}</span>
            {osoba.oblasti.length > 0 ? <span>· {popisOblasti(osoba)}</span> : null}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-3 text-xs">
          {aktivniKaret > 0 ? (
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <CreditCard className="size-3.5" aria-hidden="true" />
              {aktivniKaret === 1 ? 'karta' : `${aktivniKaret} karty`}
            </span>
          ) : null}

          {osoba.maUcet ? (
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <KeyRound className="size-3.5" aria-hidden="true" />
              {osoba.email ?? 'přihlášení'}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <UserRound className="size-3.5" aria-hidden="true" />
              bez přihlášení
            </span>
          )}
        </div>
      </Link>
    </li>
  )
}

function popisRoli(osoba: Osoba): string {
  if (osoba.role.length === 0) return 'bez role — kiosek jí nic nenabídne'
  return osoba.role.map((r) => r.nazev).join(', ')
}

function popisOblasti(osoba: Osoba): string {
  return osoba.oblasti
    .map((o) => (o.vztah === 'garant' ? `${o.nazev} (garant)` : o.nazev))
    .join(', ')
}

function pocetLidi(pocet: number): string {
  if (pocet === 1) return '1 člověk'
  if (pocet < 5) return `${pocet} lidé`
  return `${pocet} lidí`
}
