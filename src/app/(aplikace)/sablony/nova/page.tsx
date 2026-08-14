import { redirect } from 'next/navigation'
import { OdkazZpet } from '@/components/layout/odkaz-zpet'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FormularSablony } from '@/components/sablony/formular-sablony'
import { maPravo } from '@/lib/auth/opravneni'
import { nactiPrihlaseneho } from '@/lib/auth/session'
import { ulozSablonu } from '../actions'

export const metadata = { title: 'Nová šablona' }

export default async function StrankaNovaSablona() {
  const uzivatel = await nactiPrihlaseneho()
  if (!uzivatel) redirect('/login')

  if (!maPravo(uzivatel.role, 'sablony', 'zapis')) {
    return (
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>Nová šablona</CardTitle>
          <CardDescription>Šablony spravuje garant oblasti.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>
            Vaše role údržbu provádí, ale matice nesestavuje. Obraťte se na garanta své oblasti nebo
            na vedoucího údržby.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="space-y-1">
        <OdkazZpet href="/sablony" popisek="Šablony" />
        <h1 className="text-2xl font-semibold">Nová šablona</h1>
        <p className="text-muted-foreground">Nejdřív hlavička, matici úkonů doplníte hned potom.</p>
      </div>

      <FormularSablony
        akce={ulozSablonu.bind(null, null)}
        // Nabízejí se jen oblasti, které uživatel vidí; jestli v nich smí i
        // zapisovat, rozhodne RLS při uložení.
        oblasti={uzivatel.oblasti}
        hodnoty={{
          nazev: '',
          kod: '',
          oblast_id: uzivatel.oblasti.length === 1 ? (uzivatel.oblasti[0]?.id ?? '') : '',
          popis: '',
          aktivni: true,
        }}
        jeNova
        zpetHref="/sablony"
        popisekTlacitka="Založit šablonu"
      />
    </div>
  )
}
