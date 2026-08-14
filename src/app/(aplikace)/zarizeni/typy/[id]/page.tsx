import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { OdkazZpet } from '@/components/layout/odkaz-zpet'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FormularTypu } from '@/components/zarizeni/formular-typu'
import { maPravo } from '@/lib/auth/opravneni'
import { nactiPrihlaseneho } from '@/lib/auth/session'
import { nactiTyp, pocetZarizeni } from '@/lib/zarizeni/dotazy'
import { prectiSchema } from '@/lib/zarizeni/parametry'
import { schemaNaRadky } from '@/lib/zarizeni/schema-typu'
import { ulozTyp } from '../actions'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const typ = await nactiTyp(id)

  return { title: typ?.nazev ?? 'Typ zařízení' }
}

export default async function StrankaUpravaTypu({ params }: { params: Promise<{ id: string }> }) {
  const uzivatel = await nactiPrihlaseneho()
  if (!uzivatel) redirect('/login')

  const { id } = await params
  const typ = await nactiTyp(id)
  if (!typ) notFound()

  const schema = prectiSchema(typ.schema_parametru)
  const pocet = pocetZarizeni(typ)

  if (!maPravo(uzivatel.role, 'zarizeni', 'zapis')) {
    return (
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>{typ.nazev}</CardTitle>
          <CardDescription>Typ spravuje garant oblasti {typ.oblast?.nazev ?? ''}.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>
            Parametry tohoto typu:{' '}
            {Object.keys(schema).length === 0 ? 'žádné' : Object.keys(schema).length}. Strojů v
            evidenci: {pocet}.
          </p>
          <Link href="/zarizeni/typy" className="mt-4 inline-block underline">
            Zpět na typy zařízení
          </Link>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="space-y-1">
        <OdkazZpet href="/zarizeni/typy" popisek="Typy zařízení" />
        <h1 className="text-2xl font-semibold">{typ.nazev}</h1>
        <p className="text-muted-foreground">
          {typ.oblast?.nazev} · {pocet} {pocet === 1 ? 'stroj' : 'strojů'} v evidenci
        </p>
      </div>

      <FormularTypu
        akce={ulozTyp.bind(null, typ.id)}
        oblasti={uzivatel.oblasti}
        jeNovy={false}
        puvodniKlice={Object.keys(schema)}
        pocetZarizeni={pocet}
        zpetHref="/zarizeni/typy"
        popisekTlacitka="Uložit změny"
        hodnoty={{
          nazev: typ.nazev,
          kod: typ.kod,
          oblast_id: typ.oblast_id,
          popis: typ.popis ?? '',
          aktivni: typ.aktivni,
          parametry: schemaNaRadky(schema),
        }}
      />
    </div>
  )
}
