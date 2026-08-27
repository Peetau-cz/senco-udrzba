import { redirect } from 'next/navigation'
import { CircleAlert, Plus } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { TlacitkoSmazat } from '@/components/ui/tlacitko-smazat'
import { PrejmenovatDruh, PrepnoutAktivitu, PridatDruh } from '@/components/denik/formulare-druhu'
import { OdkazZpet } from '@/components/layout/odkaz-zpet'
import { maPravo } from '@/lib/auth/opravneni'
import { nactiPrihlaseneho } from '@/lib/auth/session'
import { nactiDruhyZasahu, pocetZapisuPodleDruhu } from '@/lib/denik/dotazy'
import { pridejDruh, prejmenujDruh, prepniAktivituDruhu, smazDruh } from './actions'

export const metadata = { title: 'Druhy zásahu' }

/**
 * Číselník druhů neplánovaného zásahu.
 *
 * Zadání (ř. 137-143) dává šest příkladů se slovem „například" - výčet tedy
 * z podstaty není úplný a rozšířit ho má jít záznamem, ne migrací a nasazením.
 * Proto číselník, a ne výčet v kódu (rozhodnutí z 26. 8. 2026).
 *
 * Měnit ho smí administrátor a vedoucí údržby (matice kap. 3.1), ostatní ho
 * vidí - technik má vědět, z čeho ve formuláři vybírá.
 */
export default async function StrankaDruhyZasahu() {
  const uzivatel = await nactiPrihlaseneho()
  if (!uzivatel) redirect('/login')

  const [druhy, pouziti] = await Promise.all([nactiDruhyZasahu(), pocetZapisuPodleDruhu()])
  const smiSpravovat = maPravo(uzivatel.role, 'ciselniky', 'zapis')

  const aktivni = druhy.filter((d) => d.aktivni)
  const vyrazene = druhy.filter((d) => !d.aktivni)

  return (
    <div className="max-w-3xl space-y-6">
      <OdkazZpet href="/denik" popisek="Zpět na provozní deník" />

      <div>
        <h1 className="text-2xl font-semibold">Druhy zásahu</h1>
        <p className="text-muted-foreground">
          Z čeho se vybírá při zápisu do provozního deníku. Seznam ze zadání je jen začátek —
          co se v hale opakuje, sem patří.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">V nabídce</CardTitle>
          <CardDescription>
            {aktivni.length === 0
              ? 'Nabídka je prázdná — bez druhu se zásah zapsat nedá.'
              : 'Tyhle druhy se nabízejí ve formuláři zásahu.'}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {aktivni.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">
              {smiSpravovat
                ? 'Doplňte první druh formulářem níž.'
                : 'Číselník plní vedoucí údržby.'}
            </p>
          ) : (
            <ul className="divide-y rounded-md border">
              {aktivni.map((druh) => (
                <li key={druh.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    {smiSpravovat ? (
                      <PrejmenovatDruh
                        akce={prejmenujDruh.bind(null, druh.id)}
                        nazev={druh.nazev}
                      />
                    ) : (
                      <span className="font-medium">{druh.nazev}</span>
                    )}
                    <p className="flex flex-wrap items-center gap-2 pt-1 text-xs text-muted-foreground">
                      <span className="stitek-razeny">{druh.kod}</span>
                      {popisPouziti(pouziti.get(druh.id) ?? 0)}
                    </p>
                  </div>

                  {smiSpravovat ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <PrepnoutAktivitu
                        akce={prepniAktivituDruhu.bind(null, druh.id, false)}
                        aktivni
                        nazev={druh.nazev}
                      />
                      <MazaciTlacitko
                        id={druh.id}
                        nazev={druh.nazev}
                        pouzito={pouziti.get(druh.id) ?? 0}
                      />
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {vyrazene.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Vyřazené</CardTitle>
            <CardDescription>
              Ve formuláři se nenabízejí, ale starší zápisy o svůj název nepřišly.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <ul className="divide-y rounded-md border">
              {vyrazene.map((druh) => (
                <li key={druh.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <span className="font-medium text-muted-foreground">{druh.nazev}</span>
                    <p className="flex flex-wrap items-center gap-2 pt-1 text-xs text-muted-foreground">
                      <span className="stitek-razeny">{druh.kod}</span>
                      {popisPouziti(pouziti.get(druh.id) ?? 0)}
                    </p>
                  </div>

                  {smiSpravovat ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <PrepnoutAktivitu
                        akce={prepniAktivituDruhu.bind(null, druh.id, true)}
                        aktivni={false}
                        nazev={druh.nazev}
                      />
                      <MazaciTlacitko
                        id={druh.id}
                        nazev={druh.nazev}
                        pouzito={pouziti.get(druh.id) ?? 0}
                      />
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {smiSpravovat ? (
        <Card className="border-primary/40">
          <CardHeader className="rounded-t-lg border-b border-primary/30 bg-primary/5">
            <CardTitle className="flex items-center gap-2 text-base">
              <Plus className="size-4 text-primary" aria-hidden="true" />
              Nový druh
            </CardTitle>
            <CardDescription>
              Kód se odvodí z názvu a už se nemění — páruje se přes něj případný import.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <PridatDruh akce={pridejDruh} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

function popisPouziti(pocet: number): string {
  if (pocet === 0) return 'zatím bez zápisu'
  if (pocet === 1) return '1 zápis'
  if (pocet < 5) return `${pocet} zápisy`
  return `${pocet} zápisů`
}

/**
 * Mazat jde jen druh, který nikdo nepoužil - drží ho cizí klíč s `on delete
 * restrict`. Tlačítko, které vždycky skončí chybou, je horší než žádné, takže
 * na jeho místě stojí červený štítek s důvodem. Stejně jako u umístění.
 */
function MazaciTlacitko({ id, nazev, pouzito }: { id: string; nazev: string; pouzito: number }) {
  if (pouzito > 0) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive">
        <CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />
        nelze smazat — jsou na něj zápisy
      </span>
    )
  }

  return (
    <TlacitkoSmazat
      akce={smazDruh.bind(null, id)}
      nazev={nazev}
      otazka={`Opravdu smazat druh „${nazev}"?`}
    />
  )
}
