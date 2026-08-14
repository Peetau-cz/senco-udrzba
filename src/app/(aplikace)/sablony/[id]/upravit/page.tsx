import { notFound, redirect } from 'next/navigation'
import { OdkazZpet } from '@/components/layout/odkaz-zpet'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FormularSablony } from '@/components/sablony/formular-sablony'
import { maPravo } from '@/lib/auth/opravneni'
import { nactiPrihlaseneho } from '@/lib/auth/session'
import { nactiSablonu } from '@/lib/sablony/dotazy'
import { ulozSablonu } from '../../actions'

export const metadata = { title: 'Úprava šablony' }

/**
 * Hlavička šablony - název, popis, nabízení.
 *
 * Obsah matice se tudy nemění. Ten patří k verzi a mění se založením nového
 * návrhu, aby se úprava zpětně nepromítla do hotových zakázek (R3).
 */
export default async function StrankaUpravaSablony({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const uzivatel = await nactiPrihlaseneho()
  if (!uzivatel) redirect('/login')

  const { id } = await params
  const sablona = await nactiSablonu(id)
  if (!sablona) notFound()

  if (!maPravo(uzivatel.role, 'sablony', 'zapis')) {
    return (
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>{sablona.nazev}</CardTitle>
          <CardDescription>
            Šablonu spravuje garant oblasti {sablona.oblast?.nazev}.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>Vaše role matice nesestavuje.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="space-y-1">
        <OdkazZpet href={`/sablony/${sablona.id}`} popisek={sablona.nazev} />
        <h1 className="text-2xl font-semibold">Úprava šablony</h1>
        <p className="text-muted-foreground">
          Matice úkonů se mění přes verze, ne tady — viz záložka Verze.
        </p>
      </div>

      <FormularSablony
        akce={ulozSablonu.bind(null, sablona.id)}
        oblasti={uzivatel.oblasti}
        hodnoty={{
          nazev: sablona.nazev,
          kod: sablona.kod,
          oblast_id: sablona.oblast_id,
          popis: sablona.popis ?? '',
          aktivni: sablona.aktivni,
        }}
        jeNova={false}
        zpetHref={`/sablony/${sablona.id}`}
        popisekTlacitka="Uložit změny"
      />
    </div>
  )
}
