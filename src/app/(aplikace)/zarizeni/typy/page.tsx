import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { maPravo } from '@/lib/auth/opravneni'
import { nactiPrihlaseneho } from '@/lib/auth/session'
import { nactiTypy, pocetZarizeni } from '@/lib/zarizeni/dotazy'
import { prectiSchema } from '@/lib/zarizeni/parametry'

export const metadata = { title: 'Typy zařízení' }

/**
 * Typy zařízení a jejich vlastní parametry.
 *
 * Sídlí pod zařízeními, ne pod nastavením: typy spravuje garant oblasti, kdežto
 * číselníky v nastavení jsou vyhrazené administrátorovi a vedoucímu údržby.
 * Oprávnění na typy je stejné jako na evidenci, proto patří sem.
 */
export default async function StrankaTypu() {
  const uzivatel = await nactiPrihlaseneho()
  if (!uzivatel) redirect('/login')

  const typy = await nactiTypy()
  const smiSpravovat = maPravo(uzivatel.role, 'zarizeni', 'zapis')

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/zarizeni" className="text-sm text-muted-foreground hover:underline">
            ‹ Zařízení
          </Link>
          <h1 className="text-2xl font-semibold">Typy zařízení</h1>
          <p className="text-muted-foreground">
            Typ určuje oblast údržby a technické parametry, které se u strojů evidují.
          </p>
        </div>

        {smiSpravovat ? (
          <Button asChild size="dotyk">
            <Link href="/zarizeni/typy/novy">Nový typ</Link>
          </Button>
        ) : null}
      </div>

      {typy.length === 0 ? (
        <Card>
          <CardContent className="space-y-2 py-10 text-center">
            <p className="font-medium">Zatím tu není žádný typ zařízení.</p>
            <p className="text-sm text-muted-foreground">
              Bez typu nejde založit stroj — typ určuje jeho oblast i parametry.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Typ</th>
                  <th className="px-4 py-3 font-medium">Oblast</th>
                  <th className="px-4 py-3 font-medium">Parametry</th>
                  <th className="px-4 py-3 font-medium">Zařízení</th>
                  {smiSpravovat ? (
                    <th className="px-4 py-3 text-right font-medium">
                      <span className="sr-only">Akce</span>
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {typy.map((typ) => {
                  const parametry = Object.keys(prectiSchema(typ.schema_parametru))

                  return (
                    <tr key={typ.id} className="border-b last:border-0 hover:bg-accent/50">
                      <td className="px-4 py-3">
                        <span className="font-medium">{typ.nazev}</span>
                        {!typ.aktivni ? (
                          <span className="ml-2 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                            nenabízí se
                          </span>
                        ) : null}
                        <p className="cislice-tabulkove text-xs text-muted-foreground">{typ.kod}</p>
                      </td>
                      <td className="px-4 py-3">{typ.oblast?.nazev ?? '—'}</td>
                      <td className="px-4 py-3">
                        {parametry.length === 0 ? (
                          <span className="text-muted-foreground">žádné</span>
                        ) : (
                          parametry.length
                        )}
                      </td>
                      <td className="cislice-tabulkove px-4 py-3">{pocetZarizeni(typ)}</td>
                      {smiSpravovat ? (
                        <td className="px-4 py-3 text-right">
                          <Button asChild variant="ghost" size="sm">
                            <Link href={`/zarizeni/typy/${typ.id}`}>
                              Upravit
                              <span className="sr-only"> {typ.nazev}</span>
                            </Link>
                          </Button>
                        </td>
                      ) : null}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
