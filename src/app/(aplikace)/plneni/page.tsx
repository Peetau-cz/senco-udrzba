import Link from 'next/link'
import { ChevronRight, Download } from 'lucide-react'
import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ProuzekPlneni } from '@/components/plneni/prouzek-plneni'
import { VyberObdobi } from '@/components/plneni/vyber-obdobi'
import { nactiPrihlaseneho } from '@/lib/auth/session'
import { dnesVPraze } from '@/lib/plan/terminy'
import { nactiPlneni } from '@/lib/plneni/dotazy'
import { nabidkaObdobi, popisObdobi, souhrnPlneni, zacatekMesice } from '@/lib/plneni/vypocet'

export const metadata = { title: 'Plnění matice' }

type Parametry = Record<string, string | string[] | undefined>

/**
 * Přehled plnění matice podle wireframu v docs/NAVRH.md kap. 5.2.
 *
 * Čísla čte z pohledu `v_plneni_matice`, nepočítá si je sama. Kdyby si je
 * dopočítávala, rozešla by se dřív nebo později s exportem i s dashboardem —
 * a nikdo by nevěděl, které z těch tří čísel je to správné.
 *
 * Jak přesně se plnění počítá, je rozepsané v README a ověřené skriptem
 * `supabase/tests/plneni.sql`.
 */
export default async function StrankaPlneni({
  searchParams,
}: {
  searchParams: Promise<Parametry>
}) {
  const uzivatel = await nactiPrihlaseneho()
  if (!uzivatel) redirect('/login')

  const dnes = dnesVPraze()
  const nabidka = nabidkaObdobi(dnes)
  const zadane = (await searchParams).obdobi
  const obdobi =
    typeof zadane === 'string' && nabidka.includes(zadane) ? zadane : zacatekMesice(dnes)

  const radky = await nactiPlneni(obdobi)
  const souhrn = souhrnPlneni(radky)
  const probihajici = obdobi === zacatekMesice(dnes)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Plnění matice údržby</h1>
          <p className="text-muted-foreground">
            {probihajici
              ? 'Za probíhající měsíc, k dnešnímu dni — co ještě nebylo splatné, se nepočítá.'
              : `Za ${popisObdobi(obdobi)}, měsíc uzavřený.`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <VyberObdobi nabidka={nabidka} vybrane={obdobi} />

          <Button asChild size="dotyk" variant="outline">
            <a href={`/plneni/export?obdobi=${obdobi}`}>
              <Download aria-hidden="true" className="size-4" />
              Export XLSX
            </a>
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="hlavicka-tabulky">
              <tr>
                <th className="px-4 py-3 font-medium">Oblast</th>
                <th className="px-4 py-3 text-right font-medium">Splněno</th>
                <th className="px-4 py-3 text-right font-medium">Po termínu</th>
                <th className="px-4 py-3 text-right font-medium">Nešlo provést</th>
                <th className="px-4 py-3 font-medium">Plnění</th>
                <th className="px-4 py-3 text-right font-medium">
                  <span className="sr-only">Detail</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {radky.map((r) => (
                <tr
                  key={r.oblastId}
                  className="relative cursor-pointer border-b transition-colors last:border-0 focus-within:bg-accent hover:bg-accent"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/plneni/${r.oblastId}?obdobi=${obdobi}`}
                      className="rounded-sm font-medium underline-offset-4 after:absolute after:inset-0 hover:underline focus-visible:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {r.oblastNazev}
                    </Link>
                  </td>
                  <td className="cislice-tabulkove px-4 py-3 text-right">{r.splneno}</td>
                  <td className="cislice-tabulkove px-4 py-3 text-right">
                    {r.poTerminu > 0 ? (
                      <span className="font-medium text-stav-poterminu">{r.poTerminu}</span>
                    ) : (
                      r.poTerminu
                    )}
                  </td>
                  {/* Neprovedené stojí vedle výpočtu schválně: stroj měsíc
                      v opravě není zanedbaná údržba, ale zmizet z přehledu
                      taky nemá. */}
                  <td className="cislice-tabulkove px-4 py-3 text-right text-muted-foreground">
                    {r.neprovedeno}
                  </td>
                  <td className="px-4 py-3">
                    <ProuzekPlneni splneno={r.splneno} celkem={r.celkem} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <ChevronRight
                      aria-hidden="true"
                      className="ml-auto h-4 w-4 text-muted-foreground"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="zapati-tabulky">
              <tr>
                <th className="px-4 py-3 text-left">Celkem</th>
                <td className="cislice-tabulkove px-4 py-3 text-right">{souhrn.splneno}</td>
                <td className="cislice-tabulkove px-4 py-3 text-right">{souhrn.poTerminu}</td>
                <td className="cislice-tabulkove px-4 py-3 text-right text-muted-foreground">
                  {souhrn.neprovedeno}
                </td>
                <td className="px-4 py-3">
                  <ProuzekPlneni splneno={souhrn.splneno} celkem={souhrn.celkem} />
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      <p className="text-xs text-muted-foreground">
        Do výpočtu vstupují úkony, jejichž plánovaný termín už nastal. Úkon označený jako
        neproveditelný se nepočítá ani do splněných, ani do celku — je vedle ve vlastním sloupci.
        Tolerance po termínu je nastavená na nulu, takže i den zpoždění je po termínu.
      </p>
    </div>
  )
}
