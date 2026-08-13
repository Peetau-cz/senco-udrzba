import { redirect } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { TlacitkoSmazat } from '@/components/ui/tlacitko-smazat'
import { PrejmenovatUmisteni, PridatUmisteni } from '@/components/umisteni/formulare-umisteni'
import { maPravo } from '@/lib/auth/opravneni'
import { nactiPrihlaseneho } from '@/lib/auth/session'
import { nactiStromUmisteni, type UzelUmisteni } from '@/lib/umisteni/dotazy'
import { pridejUmisteni, prejmenujUmisteni, smazUmisteni } from './actions'

export const metadata = { title: 'Umístění' }

/**
 * Strom umístění - dvě úrovně pod areálem: hala a v ní provoz nebo linka.
 *
 * Hloubka není vynucená databází (sloupec `nadrazene_id` unese libovolně hlubokou
 * hierarchii), ale rozhraním. Dvě úrovně jsou dohodnutá struktura pro Příbram;
 * kdyby přibyla třetí, je to úprava téhle obrazovky, ne migrace.
 *
 * Číselník smí měnit administrátor a vedoucí údržby (matice kap. 3.1). Ostatní
 * ho vidí, protože umístění je provozní údaj - technik potřebuje vědět, kam jde.
 */
export default async function StrankaUmisteni() {
  const uzivatel = await nactiPrihlaseneho()
  if (!uzivatel) redirect('/login')

  const { koren, haly } = await nactiStromUmisteni()
  const smiSpravovat = maPravo(uzivatel.role, 'ciselniky', 'zapis')

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Umístění</h1>
        <p className="text-muted-foreground">
          Kde stroje stojí. Nejdřív hala, pod ní provoz nebo linka — u zařízení se pak vybírá
          konkrétní místo.
        </p>
      </div>

      {koren ? null : (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            Kořen areálu v číselníku chybí. Haly se proto zakládají jako samostatné celky.
            Chcete-li mít vše pod jedním kořenem, nahrajte <code>supabase/seed.sql</code>.
          </CardContent>
        </Card>
      )}

      {haly.length === 0 ? (
        <Card>
          <CardContent className="space-y-2 py-10 text-center">
            <p className="font-medium">Zatím tu není žádná hala.</p>
            <p className="text-sm text-muted-foreground">
              {smiSpravovat
                ? 'Založte první halu formulářem níže. Provozy a linky se přidávají až do ní.'
                : 'Strukturu areálu zakládá vedoucí údržby.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        haly.map((hala) => (
          <Card key={hala.id}>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="text-base">{hala.nazev}</CardTitle>
                  <CardDescription>
                    <span className="cislice-tabulkove">{hala.kod}</span> · {popisPoctu(hala)}
                  </CardDescription>
                </div>

                {smiSpravovat ? (
                  <MazaciTlacitko uzel={hala} coJe="halu" />
                ) : null}
              </div>

              {smiSpravovat ? (
                <div className="pt-2">
                  <PrejmenovatUmisteni akce={prejmenujUmisteni.bind(null, hala.id)} nazev={hala.nazev} />
                </div>
              ) : null}
            </CardHeader>

            <CardContent className="space-y-4">
              {hala.deti.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Hala zatím nemá provozy. Zařízení se dá umístit rovnou do ní.
                </p>
              ) : (
                <ul className="divide-y rounded-md border">
                  {hala.deti.map((provoz) => (
                    <li key={provoz.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        {smiSpravovat ? (
                          <PrejmenovatUmisteni
                            akce={prejmenujUmisteni.bind(null, provoz.id)}
                            nazev={provoz.nazev}
                          />
                        ) : (
                          <span className="font-medium">{provoz.nazev}</span>
                        )}
                        <p className="text-xs text-muted-foreground">
                          <span className="cislice-tabulkove">{provoz.kod}</span> ·{' '}
                          {popisPoctu(provoz)}
                        </p>
                      </div>

                      {smiSpravovat ? <MazaciTlacitko uzel={provoz} coJe="provoz" /> : null}
                    </li>
                  ))}
                </ul>
              )}

              {smiSpravovat ? (
                <PridatUmisteni
                  akce={pridejUmisteni.bind(null, hala.id)}
                  popisek="Přidat provoz"
                  placeholder="Linka B"
                />
              ) : null}
            </CardContent>
          </Card>
        ))
      )}

      {smiSpravovat ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Nová hala</CardTitle>
            <CardDescription>
              Kód se odvodí z názvu a už se nemění — páruje se přes něj případný import.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PridatUmisteni
              akce={pridejUmisteni.bind(null, koren?.id ?? null)}
              popisek="Přidat halu"
              placeholder="Hala 2"
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

function popisPoctu(uzel: UzelUmisteni): string {
  const casti: string[] = []

  if (uzel.deti.length > 0) {
    casti.push(`${uzel.deti.length} ${uzel.deti.length === 1 ? 'provoz' : 'provozů'}`)
  }

  casti.push(
    uzel.pocetZarizeni === 1 ? '1 zařízení přímo zde' : `${uzel.pocetZarizeni} zařízení přímo zde`,
  )

  return casti.join(' · ')
}

/**
 * Mazat jde jen prázdný uzel. Databáze to hlídá cizím klíčem s `on delete
 * restrict`, ale tlačítko, které vždycky skončí chybou, je horší než žádné.
 */
function MazaciTlacitko({ uzel, coJe }: { uzel: UzelUmisteni; coJe: string }) {
  const jePrazdny = uzel.deti.length === 0 && uzel.pocetZarizeni === 0

  if (!jePrazdny) {
    return (
      <span className="text-xs text-muted-foreground">
        nelze smazat — {uzel.deti.length > 0 ? 'jsou pod ní provozy' : 'jsou tu zařízení'}
      </span>
    )
  }

  return (
    <TlacitkoSmazat
      akce={smazUmisteni.bind(null, uzel.id)}
      nazev={uzel.nazev}
      otazka={`Opravdu smazat ${coJe} „${uzel.nazev}"?`}
    />
  )
}
