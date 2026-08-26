import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CircleCheck, Image as IkonaFotky, NotebookPen, Plus, Search, Settings2, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { maPravo } from '@/lib/auth/opravneni'
import { nactiPrihlaseneho } from '@/lib/auth/session'
import { formatDatumCas } from '@/lib/datum'
import { nactiDruhyZasahu, nactiNabidkuZarizeni, nactiZapisyDeniku, STROP_SEZNAMU } from '@/lib/denik/dotazy'
import { formatDobu } from '@/lib/denik/zasah'

export const metadata = { title: 'Provozní deník' }

type Parametry = Record<string, string | string[] | undefined>

function jedna(parametry: Parametry, klic: string): string | undefined {
  const hodnota = parametry[klic]
  return typeof hodnota === 'string' && hodnota !== '' ? hodnota : undefined
}

function jmenoOsoby(osoba: { jmeno: string; prijmeni: string } | null): string {
  if (!osoba) return '—'
  return `${osoba.jmeno} ${osoba.prijmeni}`.trim() || '—'
}

/**
 * Provozní deník (modul M5).
 *
 * Evidence neplánovaných zásahů - toho, co se se stroji dělo mimo matici.
 * Plán údržby ani plnění matice se odsud neovlivňuje (zadání ř. 144), a proto
 * tu není nic, co by do plánu sahalo.
 *
 * Oblast se stejně jako jinde nefiltruje vlastním polem, ale přepínačem
 * v hlavičce, který drží volbu v adrese jako `?oblast=<kod>`.
 */
export default async function StrankaDenik({
  searchParams,
}: {
  searchParams: Promise<Parametry>
}) {
  const uzivatel = await nactiPrihlaseneho()
  if (!uzivatel) redirect('/login')

  const parametry = await searchParams

  const kodOblasti = jedna(parametry, 'oblast')
  const oblast = uzivatel.oblasti.find((o) => o.kod === kodOblasti)

  const druhId = jedna(parametry, 'druh')
  const zarizeniId = jedna(parametry, 'stroj')
  const od = jedna(parametry, 'od')
  const doKdy = jedna(parametry, 'do')
  const hledani = jedna(parametry, 'hledani')

  const [druhy, stroje, zapisy] = await Promise.all([
    nactiDruhyZasahu(),
    nactiNabidkuZarizeni(oblast?.id),
    nactiZapisyDeniku({
      oblastId: oblast?.id,
      druhId,
      zarizeniId,
      od,
      do: doKdy,
      hledani,
    }),
  ])

  const smiZapisovat = maPravo(uzivatel.role, 'denik', 'zapis')
  const smiSpravovatCiselnik = maPravo(uzivatel.role, 'ciselniky', 'zapis')

  const jeFiltrovano = Boolean(druhId || zarizeniId || od || doKdy || hledani)
  const zapsano = jedna(parametry, 'zapsano')
  const fotkaSelhala = jedna(parametry, 'fotka') === 'chyba'

  // Oblast se do „Zrušit filtr" nepočítá - tu drží přepínač v hlavičce a bylo by
  // překvapivé, kdyby uživatele křížek vyhodil z oblasti nastavené jinde.
  const adresaBezFiltru = kodOblasti ? `/denik?oblast=${kodOblasti}` : '/denik'

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Provozní deník</h1>
          <p className="text-muted-foreground">
            {zapisy.length === 0
              ? 'Neplánované zásahy — co se se stroji dělo mimo plán údržby.'
              : `${jeFiltrovano ? 'Nalezeno' : 'Zápisů'}: ${zapisy.length}${zapisy.length === STROP_SEZNAMU ? ' (zobrazují se nejnovější)' : ''}.`}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          {smiSpravovatCiselnik ? (
            <Button asChild size="dotyk" variant="outline">
              <Link href="/nastaveni/druhy-zasahu">
                <Settings2 aria-hidden="true" className="h-4 w-4" />
                Druhy zásahu
              </Link>
            </Button>
          ) : null}

          {smiZapisovat ? (
            <Button asChild size="dotyk">
              <Link href="/denik/novy">
                <Plus aria-hidden="true" className="h-4 w-4" />
                Zapsat zásah
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      {zapsano ? (
        <Card
          className={
            fotkaSelhala ? 'border-l-4 border-l-destructive' : 'border-l-4 border-l-stav-splneno'
          }
        >
          <CardContent className="flex gap-3 py-4 text-sm">
            {fotkaSelhala ? (
              <>
                <TriangleAlert
                  className="mt-0.5 size-5 shrink-0 text-destructive"
                  aria-hidden="true"
                />
                <span>
                  <strong className="font-medium">Zásah je zapsaný, fotka ne.</strong> Úložiště
                  ji odmítlo. Zápis zůstává v deníku — fotku k němu přidejte znovu.
                </span>
              </>
            ) : (
              <>
                <CircleCheck
                  className="mt-0.5 size-5 shrink-0 text-stav-splneno"
                  aria-hidden="true"
                />
                <span>Zásah je zapsaný v deníku.</span>
              </>
            )}
          </CardContent>
        </Card>
      ) : null}

      {/* Filtr je obyčejný GET formulář - funguje i bez javascriptu a odkaz na
          vyfiltrovaný deník jde poslat kolegovi. */}
      <Card>
        <CardContent className="py-4">
          <form method="get" className="flex flex-wrap items-end gap-3">
            {kodOblasti ? <input type="hidden" name="oblast" value={kodOblasti} /> : null}

            <div className="space-y-1">
              <label htmlFor="filtr-druh" className="text-xs text-muted-foreground">
                Druh zásahu
              </label>
              <Select id="filtr-druh" name="druh" defaultValue={druhId ?? ''} className="w-48">
                <option value="">Všechny druhy</option>
                {druhy.map((druh) => (
                  <option key={druh.id} value={druh.id}>
                    {druh.aktivni ? druh.nazev : `${druh.nazev} (vyřazený)`}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-1">
              <label htmlFor="filtr-stroj" className="text-xs text-muted-foreground">
                Stroj
              </label>
              <Select id="filtr-stroj" name="stroj" defaultValue={zarizeniId ?? ''} className="w-56">
                <option value="">Všechny stroje</option>
                {stroje.map((stroj) => (
                  <option key={stroj.id} value={stroj.id}>
                    {stroj.nazev}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-1">
              <label htmlFor="filtr-od" className="text-xs text-muted-foreground">
                Od
              </label>
              <Input id="filtr-od" name="od" type="date" defaultValue={od ?? ''} className="w-40" />
            </div>

            <div className="space-y-1">
              <label htmlFor="filtr-do" className="text-xs text-muted-foreground">
                Do
              </label>
              <Input id="filtr-do" name="do" type="date" defaultValue={doKdy ?? ''} className="w-40" />
            </div>

            <div className="space-y-1">
              <label htmlFor="filtr-hledani" className="text-xs text-muted-foreground">
                V popisu
              </label>
              <Input
                id="filtr-hledani"
                name="hledani"
                defaultValue={hledani ?? ''}
                placeholder="hadice"
                className="w-44"
              />
            </div>

            <Button type="submit" size="dotyk" variant="outline">
              <Search aria-hidden="true" className="h-4 w-4" />
              Filtrovat
            </Button>

            {jeFiltrovano ? (
              <Button asChild size="dotyk" variant="ghost">
                <Link href={adresaBezFiltru}>Zrušit filtr</Link>
              </Button>
            ) : null}
          </form>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Kdy</th>
                <th className="px-4 py-3 font-medium">Stroj</th>
                <th className="px-4 py-3 font-medium">Druh</th>
                <th className="px-4 py-3 font-medium">Co se dělo</th>
                <th className="px-4 py-3 font-medium">Provedl</th>
                <th className="px-4 py-3 font-medium">Doba</th>
              </tr>
            </thead>
            <tbody>
              {zapisy.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <NotebookPen
                      aria-hidden="true"
                      className="mx-auto mb-4 h-10 w-10 text-zvyrazneni/40"
                    />
                    <p className="font-medium">
                      {jeFiltrovano ? 'Filtru neodpovídá žádný zápis.' : 'V deníku zatím nic není.'}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {jeFiltrovano
                        ? 'Zkuste zadání zkrátit nebo filtr zrušte.'
                        : smiZapisovat
                          ? 'První zásah zapíšete tlačítkem nahoře.'
                          : 'Zápisy pořizuje údržba.'}
                    </p>
                  </td>
                </tr>
              ) : (
                zapisy.map((zapis) => (
                  <tr key={zapis.id} className="border-b transition-colors last:border-0 hover:bg-accent">
                    <td className="whitespace-nowrap px-4 py-3">
                      {formatDatumCas(zapis.provedeno_at)}
                    </td>
                    <td className="px-4 py-3">
                      {zapis.stroj ? (
                        <Link
                          href={`/zarizeni/${zapis.zarizeni_id}`}
                          className="font-medium underline-offset-4 hover:underline"
                        >
                          {zapis.stroj.nazev}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                      {zapis.stroj?.inventarni_cislo ? (
                        <p className="text-xs text-muted-foreground">
                          <span className="stitek-razeny">{zapis.stroj.inventarni_cislo}</span>
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">{zapis.druh?.nazev ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className="flex items-start gap-2">
                        <span>{zapis.popis}</span>
                        {zapis.fotek > 0 ? (
                          <span
                            className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground"
                            title={zapis.fotek === 1 ? '1 fotka' : `${zapis.fotek} fotky`}
                          >
                            <IkonaFotky aria-hidden="true" className="h-3.5 w-3.5" />
                            {zapis.fotek}
                          </span>
                        ) : null}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {jmenoOsoby(zapis.provedl)}
                      {/* Kdo zápis pořídil se ukazuje jen tehdy, když to byl někdo
                          jiný - v hale zapisuje jeden tablet za partu a bez toho
                          by historie tvrdila, že u stroje byl ten, kdo psal. */}
                      {zapis.zapsal && zapis.zapsal.id !== zapis.provedl?.id ? (
                        <p className="text-xs text-muted-foreground">
                          zapsal {jmenoOsoby(zapis.zapsal)}
                        </p>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {formatDobu(zapis.doba_trvani_min)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
