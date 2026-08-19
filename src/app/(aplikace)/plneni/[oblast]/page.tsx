import Link from 'next/link'
import { CircleCheck, TriangleAlert } from 'lucide-react'
import { notFound, redirect } from 'next/navigation'
import { OdkazZpet } from '@/components/layout/odkaz-zpet'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ProuzekPlneni } from '@/components/plneni/prouzek-plneni'
import { ZnackaTerminu } from '@/components/plan/znacka-terminu'
import { nactiPrihlaseneho } from '@/lib/auth/session'
import { formatDatum } from '@/lib/datum'
import { postupZakazky } from '@/lib/plan/dotazy'
import { dnesVPraze } from '@/lib/plan/terminy'
import { nactiNesplneneVObdobi, nactiPlneni, nactiPoTerminu } from '@/lib/plneni/dotazy'
import { nabidkaObdobi, popisObdobi, zacatekMesice } from '@/lib/plneni/vypocet'

type Parametry = Record<string, string | string[] | undefined>

export async function generateMetadata({ params }: { params: Promise<{ oblast: string }> }) {
  const { oblast } = await params
  const radky = await nactiPlneni(zacatekMesice(dnesVPraze()))

  return { title: radky.find((r) => r.oblastId === oblast)?.oblastNazev ?? 'Plnění oblasti' }
}

/**
 * Rozklik oblasti z přehledu plnění.
 *
 * Wireframe kap. 5.2 to popisuje jako „seznam nesplněných a blížících se
 * údržeb". Rozdělené na dvě části schválně: restance z minulosti jsou jiný druh
 * práce než to, co teprve přijde, a míchat je dohromady znamená nevidět ani
 * jedno.
 */
export default async function DetailOblasti({
  params,
  searchParams,
}: {
  params: Promise<{ oblast: string }>
  searchParams: Promise<Parametry>
}) {
  const uzivatel = await nactiPrihlaseneho()
  if (!uzivatel) redirect('/login')

  const { oblast: oblastId } = await params
  const dnes = dnesVPraze()
  const nabidka = nabidkaObdobi(dnes)
  const zadane = (await searchParams).obdobi
  const obdobi =
    typeof zadane === 'string' && nabidka.includes(zadane) ? zadane : zacatekMesice(dnes)

  const radky = await nactiPlneni(obdobi)
  const oblast = radky.find((r) => r.oblastId === oblastId)

  // Cizí oblast RLS z dotazu odfiltruje. Pro uživatele je to totéž jako
  // neexistující oblast - a je to tak správně, existenci neprozrazujeme.
  if (!oblast) notFound()

  const [restance, zakazky] = await Promise.all([
    nactiPoTerminu(100, oblastId),
    nactiNesplneneVObdobi(oblastId, obdobi),
  ])

  const nedokoncene = zakazky.filter((z) => z.stav !== 'dokonceno')

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <OdkazZpet href={`/plneni?obdobi=${obdobi}`} popisek="Plnění matice" />
        <h1 className="text-2xl font-semibold">{oblast.oblastNazev}</h1>
        <p className="text-muted-foreground">{popisObdobi(obdobi)}</p>
      </div>

      <Card>
        <CardContent className="grid gap-6 pt-6 sm:grid-cols-4">
          <Udaj popisek="Splněno v termínu" hodnota={oblast.splneno} />
          <Udaj popisek="Po termínu" hodnota={oblast.poTerminu} zvyraznit={oblast.poTerminu > 0} />
          <Udaj popisek="Nešlo provést" hodnota={oblast.neprovedeno} tlumit />
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Plnění</p>
            <div className="mt-2">
              <ProuzekPlneni splneno={oblast.splneno} celkem={oblast.celkem} sirka="w-24" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TriangleAlert aria-hidden="true" className="h-4 w-4 text-stav-poterminu" />
            Restance
          </CardTitle>
          <CardDescription>
            Rozdělané zakázky po termínu — bez ohledu na zvolený měsíc, protože udělat se musí
            tak jako tak.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {restance.length === 0 ? (
            <p className="text-sm text-muted-foreground">V této oblasti nic nevisí.</p>
          ) : (
            <ul className="divide-y">
              {restance.map((z) => (
                <li
                  key={z.zakazka_id}
                  className="flex flex-wrap items-center justify-between gap-3 py-2"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/zakazky/${z.zakazka_id}`}
                      className="text-sm font-medium underline-offset-4 hover:underline"
                    >
                      {z.zarizeni_nazev}
                    </Link>
                    <span className="block text-xs text-muted-foreground">
                      {z.profese_nazev} · {z.vyrizeno} z {z.kroku} hotovo ·{' '}
                      {formatDatum(z.planovany_termin)}
                    </span>
                  </div>
                  <ZnackaTerminu termin={z.planovany_termin} dnes={dnes} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CircleCheck aria-hidden="true" className="h-4 w-4 text-zvyrazneni" />
            Zakázky měsíce
          </CardTitle>
          <CardDescription>
            Vše, co bylo na {popisObdobi(obdobi)} naplánované. Zrušené se nepočítají a nejsou tu.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {zakazky.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              V tomto měsíci nebyla v oblasti naplánovaná žádná údržba.
            </p>
          ) : (
            <>
              {nedokoncene.length > 0 ? (
                <p className="mb-3 text-sm text-muted-foreground">
                  Nedokončených: <strong>{nedokoncene.length}</strong> z {zakazky.length}.
                </p>
              ) : null}

              <ul className="divide-y">
                {zakazky.map((z) => {
                  const { hotovo, celkem } = postupZakazky(z)

                  return (
                    <li
                      key={z.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-2"
                    >
                      <div className="min-w-0">
                        <Link
                          href={`/zakazky/${z.id}`}
                          className="text-sm font-medium underline-offset-4 hover:underline"
                        >
                          {z.zarizeni?.nazev ?? 'neznámé zařízení'}
                        </Link>
                        <span className="block text-xs text-muted-foreground">
                          {z.profese?.nazev ?? 'bez profese'} · {hotovo} z {celkem} hotovo ·{' '}
                          {formatDatum(z.planovany_termin)}
                        </span>
                      </div>

                      <span
                        className={`rounded-md px-2 py-1 text-xs font-medium ${
                          z.stav === 'dokonceno'
                            ? 'bg-stav-splneno/10 text-stav-splneno'
                            : 'bg-secondary text-secondary-foreground'
                        }`}
                      >
                        {z.stav === 'dokonceno' ? 'dokončeno' : 'rozděláno'}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Udaj({
  popisek,
  hodnota,
  zvyraznit = false,
  tlumit = false,
}: {
  popisek: string
  hodnota: number
  zvyraznit?: boolean
  tlumit?: boolean
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{popisek}</p>
      <p
        className={`cislice-tabulkove mt-2 text-2xl font-semibold ${
          zvyraznit ? 'text-stav-poterminu' : tlumit ? 'text-muted-foreground' : ''
        }`}
      >
        {hodnota}
      </p>
    </div>
  )
}
