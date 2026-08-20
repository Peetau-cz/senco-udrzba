import { redirect } from 'next/navigation'
import { CircleAlert, Plus } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { TlacitkoSmazat } from '@/components/ui/tlacitko-smazat'
import { PrejmenovatUmisteni, PridatUmisteni } from '@/components/umisteni/formulare-umisteni'
import { maPravo } from '@/lib/auth/opravneni'
import { nactiPrihlaseneho } from '@/lib/auth/session'
import { nactiStromUmisteni, type UzelUmisteni } from '@/lib/umisteni/dotazy'
import { pocetZarizeniVPodstromu } from '@/lib/umisteni/zobrazeni'
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
        <Card className="border-l-4 border-l-destructive">
          <CardContent className="flex gap-3 py-6 text-sm text-muted-foreground">
            <CircleAlert className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden="true" />
            <span>
              Kořen areálu v číselníku chybí. Haly se proto zakládají jako samostatné celky.
              Chcete-li mít vše pod jedním kořenem, nahrajte <code>supabase/seed.sql</code>.
            </span>
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
                    <span className="stitek-razeny">{hala.kod}</span>{' '}
                    <span className="pl-1">{popisPoctu(hala)}</span>
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
                        <p className="flex flex-wrap items-center gap-2 pt-1 text-xs text-muted-foreground">
                          <span className="stitek-razeny">{provoz.kod}</span>
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

      {/* Zakládání haly je akce, a akce nese v aplikaci zelenou (globals.css).
          Rámeček ji odlišuje od karet hal nad ní, které jen vypisují stav. */}
      {smiSpravovat ? (
        <Card className="border-primary/40">
          <CardHeader className="rounded-t-lg border-b border-primary/30 bg-primary/5">
            <CardTitle className="flex items-center gap-2 text-base">
              <Plus className="size-4 text-primary" aria-hidden="true" />
              Nová hala
            </CardTitle>
            <CardDescription>
              Kód se odvodí z názvu a už se nemění — páruje se přes něj případný import.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
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

/**
 * Popisek pod názvem: kolik má uzel provozů a kolik zařízení.
 *
 * Zařízení se počítají za celý podstrom. Stroj se zadává do provozu, ne do haly,
 * takže hala počítaná jen z přímých zařízení hlásila nulu i u plné haly.
 * Kolik z nich stojí v hale mimo provozy se dopíše, jen když takové jsou.
 */
function popisPoctu(uzel: UzelUmisteni): string {
  const casti: string[] = []

  if (uzel.deti.length > 0) casti.push(popisProvozu(uzel.deti.length))

  const celkem = pocetZarizeniVPodstromu(uzel)
  casti.push(celkem === 1 ? '1 zařízení' : `${celkem} zařízení`)

  if (uzel.deti.length > 0 && uzel.pocetZarizeni > 0) {
    casti.push(`z toho ${uzel.pocetZarizeni} přímo v hale`)
  }

  return casti.join(' · ')
}

function popisProvozu(pocet: number): string {
  if (pocet === 1) return '1 provoz'
  if (pocet < 5) return `${pocet} provozy`
  return `${pocet} provozů`
}

/**
 * Mazat jde jen prázdný uzel. Databáze to hlídá cizím klíčem s `on delete
 * restrict`, ale tlačítko, které vždycky skončí chybou, je horší než žádné.
 *
 * Důvod je červený štítek, ne šedá poznámka: na místě, kde ostatní řádky mají
 * tlačítko, se šedý text přehlédne a vypadá to, že mazání prostě chybí.
 */
function MazaciTlacitko({ uzel, coJe }: { uzel: UzelUmisteni; coJe: string }) {
  const jePrazdny = uzel.deti.length === 0 && uzel.pocetZarizeni === 0

  if (!jePrazdny) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive">
        <CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />
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
