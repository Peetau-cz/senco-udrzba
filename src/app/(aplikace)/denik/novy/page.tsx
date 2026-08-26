import { redirect } from 'next/navigation'
import { NotebookPen } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FormularZasahu } from '@/components/denik/formular-zasahu'
import { OdkazZpet } from '@/components/layout/odkaz-zpet'
import { maPravo } from '@/lib/auth/opravneni'
import { nactiPrihlaseneho } from '@/lib/auth/session'
import { nactiDruhyZasahu, nactiLidi, nactiNabidkuZarizeni } from '@/lib/denik/dotazy'
import { nyniProFormular } from '@/lib/denik/zasah'
import { zapisZasah } from '../actions'

export const metadata = { title: 'Nový zásah' }

type Parametry = Record<string, string | string[] | undefined>

/**
 * Zápis neplánovaného zásahu.
 *
 * Stroj se dá předvyplnit z adresy (`?zarizeni=<id>`), aby šlo zapsat zásah
 * rovnou z karty stroje a technik ho nemusel hledat v seznamu.
 */
export default async function StrankaNovyZasah({
  searchParams,
}: {
  searchParams: Promise<Parametry>
}) {
  const uzivatel = await nactiPrihlaseneho()
  if (!uzivatel) redirect('/login')

  const parametry = await searchParams
  const zarizeni = typeof parametry.zarizeni === 'string' ? parametry.zarizeni : undefined

  const [stroje, druhy, lide] = await Promise.all([
    nactiNabidkuZarizeni(),
    nactiDruhyZasahu(true),
    nactiLidi(),
  ])

  const smiZapisovat = maPravo(uzivatel.role, 'denik', 'zapis')

  return (
    <div className="max-w-3xl space-y-6">
      <OdkazZpet href="/denik" popisek="Zpět na provozní deník" />

      <div>
        <h1 className="text-2xl font-semibold">Zápis zásahu</h1>
        <p className="text-muted-foreground">
          Neplánovaná práce na stroji — výměna, dotažení, seřízení, čištění. Plánu údržby se
          zápis nedotkne.
        </p>
      </div>

      {!smiZapisovat ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="font-medium">Do provozního deníku nemáte právo zapisovat.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Zápisy pořizuje údržba; management má deník jen ke čtení.
            </p>
          </CardContent>
        </Card>
      ) : druhy.length === 0 ? (
        <Card className="border-l-4 border-l-destructive">
          <CardContent className="py-10 text-center">
            <p className="font-medium">Číselník druhů zásahu je prázdný.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Bez druhu se zásah zapsat nedá. Doplní ho vedoucí údržby v nastavení.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <NotebookPen className="size-4 text-zvyrazneni" aria-hidden="true" />
              Co se se strojem dělo
            </CardTitle>
            <CardDescription>
              Zapsat jde i zpětně — po směně, druhý den. Opravit zápis můžete 24 hodin,
              pak už jen vedoucí údržby.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <FormularZasahu
              akce={zapisZasah}
              stroje={stroje}
              druhy={druhy}
              lide={lide}
              vychoziZarizeniId={zarizeni}
              vychoziCas={nyniProFormular()}
              vychoziProvedlId={uzivatel.id}
            />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
