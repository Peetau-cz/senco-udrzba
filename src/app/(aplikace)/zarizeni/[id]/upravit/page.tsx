import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FormularZarizeni } from '@/components/zarizeni/formular-zarizeni'
import { maPravo } from '@/lib/auth/opravneni'
import { nactiPrihlaseneho } from '@/lib/auth/session'
import { nactiCiselniky, nactiZarizeni } from '@/lib/zarizeni/dotazy'
import type { HodnotyParametru } from '@/lib/zarizeni/parametry'
import { ulozZarizeni } from '../../actions'

export const metadata = { title: 'Úprava zařízení' }

export default async function StrankaUpravaZarizeni({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const uzivatel = await nactiPrihlaseneho()
  if (!uzivatel) redirect('/login')

  const { id } = await params
  const zarizeni = await nactiZarizeni(id)
  if (!zarizeni) notFound()

  if (!maPravo(uzivatel.role, 'zarizeni', 'zapis')) {
    return (
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>{zarizeni.nazev}</CardTitle>
          <CardDescription>Kartu smí měnit garant oblasti.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <Link href={`/zarizeni/${zarizeni.id}`} className="underline">
            Zpět na kartu zařízení
          </Link>
        </CardContent>
      </Card>
    )
  }

  const ciselniky = await nactiCiselniky()
  const parametry = (zarizeni.parametry ?? {}) as HodnotyParametru

  return (
    <div className="max-w-3xl space-y-6">
      <div className="space-y-1">
        <Link href={`/zarizeni/${zarizeni.id}`} className="text-sm text-muted-foreground hover:underline">
          ‹ {zarizeni.nazev}
        </Link>
        <h1 className="text-2xl font-semibold">Úprava zařízení</h1>
        <p className="text-muted-foreground">
          Každá změna se zapisuje do auditního logu (zadání ř. 157).
        </p>
      </div>

      <FormularZarizeni
        akce={ulozZarizeni.bind(null, zarizeni.id)}
        typy={ciselniky.typy}
        umisteni={ciselniky.umisteni}
        osoby={ciselniky.osoby}
        zpetHref={`/zarizeni/${zarizeni.id}`}
        popisekTlacitka="Uložit změny"
        hodnoty={{
          nazev: zarizeni.nazev ?? '',
          typ_zarizeni_id: zarizeni.typ_zarizeni_id ?? '',
          inventarni_cislo: zarizeni.inventarni_cislo ?? '',
          vyrobce: zarizeni.vyrobce ?? '',
          model: zarizeni.model ?? '',
          vyrobni_cislo: zarizeni.vyrobni_cislo ?? '',
          rok_vyroby: zarizeni.rok_vyroby?.toString() ?? '',
          umisteni_id: zarizeni.umisteni_id ?? '',
          odpovedna_osoba_id: zarizeni.odpovedna_osoba_id ?? '',
          stav: zarizeni.stav,
          poznamka: zarizeni.poznamka ?? '',
          parametry,
        }}
      />
    </div>
  )
}
