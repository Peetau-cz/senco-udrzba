import { notFound, redirect } from 'next/navigation'
import { CreditCard, KeyRound, UserRound } from 'lucide-react'
import {
  FormularKarty,
  FormularOsoby,
  FormularZarazeni,
  PrepnoutAktivituOsoby,
  TlacitkoVyraditKartu,
} from '@/components/osoby/formulare-osoby'
import { OdkazZpet } from '@/components/layout/odkaz-zpet'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { maPravo } from '@/lib/auth/opravneni'
import { nactiPrihlaseneho } from '@/lib/auth/session'
import { nactiCiselnikyOsob, nactiOsobu } from '@/lib/osoby/dotazy'
import {
  nastavZarazeni,
  prepniAktivituOsoby,
  sparujKartu,
  ulozOsobu,
  vyradKartu,
} from '../actions'

export const metadata = { title: 'Osoba' }

export default async function StrankaOsoby({ params }: { params: Promise<{ id: string }> }) {
  const uzivatel = await nactiPrihlaseneho()
  if (!uzivatel) redirect('/login')
  if (!maPravo(uzivatel.role, 'uzivatele', 'zapis')) redirect('/')

  const { id } = await params
  const [osoba, ciselniky] = await Promise.all([nactiOsobu(id), nactiCiselnikyOsob()])
  if (!osoba) notFound()

  const aktivniKarty = osoba.karty.filter((k) => k.aktivni)
  const vyrazeneKarty = osoba.karty.filter((k) => !k.aktivni)

  return (
    <div className="max-w-3xl space-y-6">
      <OdkazZpet href="/nastaveni/uzivatele" popisek="Zpět na seznam osob" />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{osoba.celeJmeno}</h1>
          <p className="flex items-center gap-1.5 text-muted-foreground">
            {osoba.maUcet ? (
              <>
                <KeyRound className="size-4" aria-hidden="true" />
                Přihlašuje se jako {osoba.email ?? 'neznámá adresa'}
              </>
            ) : (
              <>
                <UserRound className="size-4" aria-hidden="true" />
                Bez přihlášení — u kiosku se prokazuje kartou
              </>
            )}
          </p>
        </div>

        <PrepnoutAktivituOsoby
          akce={prepniAktivituOsoby.bind(null, osoba.id, !osoba.aktivni)}
          aktivni={osoba.aktivni}
          jmeno={osoba.celeJmeno}
        />
      </div>

      {!osoba.aktivni ? (
        <Card className="border-destructive/40">
          <CardContent className="py-4 text-sm">
            Tahle osoba je vyřazená z evidence. V nabídkách se neobjeví a od kiosku se neprokáže.
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Údaje</CardTitle>
        </CardHeader>
        <CardContent>
          <FormularOsoby
            akce={ulozOsobu.bind(null, osoba.id)}
            hodnoty={{
              jmeno: osoba.jmeno,
              prijmeni: osoba.prijmeni,
              osobniCislo: osoba.osobniCislo,
              email: osoba.email,
            }}
            popisekTlacitka="Uložit údaje"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Zařazení</CardTitle>
          <CardDescription>
            Role je zároveň profese — podle ní plánovač sdružuje zakázky a podle ní kiosek
            vybere, co tomuhle člověku po přiložení karty ukázat. Vyplňuje se i těm, kdo se
            nepřihlašují.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FormularZarazeni
            akce={nastavZarazeni.bind(null, osoba.id)}
            role={ciselniky.role}
            oblasti={ciselniky.oblasti}
            zvoleneRole={osoba.role.map((r) => r.id)}
            zvoleneOblasti={new Map(osoba.oblasti.map((o) => [o.id, o.vztah]))}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="size-4" aria-hidden="true" />
            Karty
          </CardTitle>
          <CardDescription>
            Ta samá karta, kterou má na turniket. S docházkou se nepropojujeme — číslo si
            přečteme vlastní čtečkou a spárujeme sami.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {aktivniKarty.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Žádná karta. Bez ní se u kiosku prokáže jen osobním číslem
              {osoba.osobniCislo ? '' : ', a to zatím taky nemá vyplněné'}.
            </p>
          ) : (
            <ul className="divide-y rounded-md border">
              {aktivniKarty.map((karta) => (
                <li key={karta.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                  <span className="stitek-razeny flex-1">{karta.cislo}</span>
                  <TlacitkoVyraditKartu
                    akce={vyradKartu.bind(null, karta.id, osoba.id)}
                    cislo={karta.cislo}
                  />
                </li>
              ))}
            </ul>
          )}

          <FormularKarty akce={sparujKartu.bind(null, osoba.id)} />

          {vyrazeneKarty.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              Vyřazené: {vyrazeneKarty.map((k) => k.cislo).join(', ')}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Přihlášení</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          {osoba.maUcet ? (
            <p>
              Účet existuje a je k této osobě připojený. Heslo si mění uživatel sám, reset
              zařídí administrátor v Supabase.
            </p>
          ) : (
            <>
              <p>
                Tahle osoba se nepřihlašuje a pro dílnu je to běžný stav — technici e-mail
                nemají a k práci ho nepotřebují.
              </p>
              <p>
                Kdyby přihlášení dostat měla, vyplňte jí výš e-mail a účet na stejnou adresu
                založte v Supabase. Připojí se k téhle osobě sám, takže o historii nepřijde.
                Zakládat účty přímo odsud nejde záměrně — vyžadovalo by to servisní klíč,
                který do aplikace nepatří.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
