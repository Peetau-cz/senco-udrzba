import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FormularTypu } from '@/components/zarizeni/formular-typu'
import { maPravo } from '@/lib/auth/opravneni'
import { nactiPrihlaseneho } from '@/lib/auth/session'
import { ulozTyp } from '../actions'

export const metadata = { title: 'Nový typ zařízení' }

export default async function StrankaNovyTyp() {
  const uzivatel = await nactiPrihlaseneho()
  if (!uzivatel) redirect('/login')

  if (!maPravo(uzivatel.role, 'zarizeni', 'zapis')) {
    return (
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>Nový typ zařízení</CardTitle>
          <CardDescription>Typy spravuje garant oblasti.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <Link href="/zarizeni/typy" className="underline">
            Zpět na typy zařízení
          </Link>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="space-y-1">
        <Link href="/zarizeni/typy" className="text-sm text-muted-foreground hover:underline">
          ‹ Typy zařízení
        </Link>
        <h1 className="text-2xl font-semibold">Nový typ zařízení</h1>
        <p className="text-muted-foreground">
          Parametry se dají doplnit i později — typ bez nich funguje.
        </p>
      </div>

      <FormularTypu
        akce={ulozTyp.bind(null, null)}
        // Nabízejí se jen oblasti, které uživatel vidí; jestli v nich smí i
        // zakládat, rozhodne až politika typ_zarizeni_insert.
        oblasti={uzivatel.oblasti}
        jeNovy
        puvodniKlice={[]}
        pocetZarizeni={0}
        zpetHref="/zarizeni/typy"
        popisekTlacitka="Založit typ"
        hodnoty={{
          nazev: '',
          kod: '',
          oblast_id: uzivatel.oblasti.length === 1 ? uzivatel.oblasti[0]!.id : '',
          popis: '',
          aktivni: true,
          parametry: [],
        }}
      />
    </div>
  )
}
