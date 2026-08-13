import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { ZnackaStavu } from '@/components/zarizeni/znacka-stavu'
import { maPravo } from '@/lib/auth/opravneni'
import { nactiPrihlaseneho } from '@/lib/auth/session'
import { nactiCiselniky, nactiSeznamZarizeni } from '@/lib/zarizeni/dotazy'
import { STAVY_ZARIZENI } from '@/lib/zarizeni/formular'

export const metadata = { title: 'Zařízení' }

type Parametry = Record<string, string | string[] | undefined>

function jedna(parametry: Parametry, klic: string): string | undefined {
  const hodnota = parametry[klic]
  return typeof hodnota === 'string' && hodnota !== '' ? hodnota : undefined
}

/**
 * Seznam zařízení (modul M1).
 *
 * Oblast se nefiltruje vlastním polem - používá se přepínač v hlavičce, který
 * drží volbu v adrese jako `?oblast=<kod>`. Uživatel tak má jedno místo, kde
 * přepíná oblast, ať je kdekoli v aplikaci.
 */
export default async function StrankaZarizeni({
  searchParams,
}: {
  searchParams: Promise<Parametry>
}) {
  const uzivatel = await nactiPrihlaseneho()
  if (!uzivatel) redirect('/login')

  const parametry = await searchParams
  const ciselniky = await nactiCiselniky()

  const kodOblasti = jedna(parametry, 'oblast')
  const kodTypu = jedna(parametry, 'typ')
  const stav = jedna(parametry, 'stav')
  const hledani = jedna(parametry, 'hledani')

  const oblast = uzivatel.oblasti.find((o) => o.kod === kodOblasti)
  const typ = ciselniky.typy.find((t) => t.kod === kodTypu)

  const zarizeni = await nactiSeznamZarizeni({
    oblastId: oblast?.id,
    typId: typ?.id,
    stav,
    hledani,
  })

  const smiSpravovat = maPravo(uzivatel.role, 'zarizeni', 'zapis')
  const jeFiltrovano = Boolean(kodOblasti || kodTypu || stav || hledani)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Zařízení</h1>
          <p className="text-muted-foreground">
            {zarizeni.length === 0
              ? 'Evidence strojů a jejich technických údajů.'
              : `Celkem ${zarizeni.length} zařízení.`}
          </p>
        </div>

        {smiSpravovat ? (
          <Button asChild size="dotyk">
            <Link href="/zarizeni/nove">Nové zařízení</Link>
          </Button>
        ) : null}
      </div>

      <Card>
        <CardContent className="pt-6">
          <form method="get" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Volbu oblasti drží přepínač v hlavičce - odesláním filtru o ni nesmíme přijít. */}
            {kodOblasti ? <input type="hidden" name="oblast" value={kodOblasti} /> : null}

            <div className="space-y-2 lg:col-span-2">
              <Label htmlFor="hledani">Hledat</Label>
              <Input
                id="hledani"
                name="hledani"
                defaultValue={hledani ?? ''}
                placeholder="název nebo inventární číslo"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="typ">Typ</Label>
              <Select id="typ" name="typ" defaultValue={kodTypu ?? ''}>
                <option value="">Všechny typy</option>
                {ciselniky.typy.map((t) => (
                  <option key={t.id} value={t.kod}>
                    {t.nazev}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="stav">Stav</Label>
              <Select id="stav" name="stav" defaultValue={stav ?? ''}>
                <option value="">Všechny stavy</option>
                {STAVY_ZARIZENI.map((s) => (
                  <option key={s.hodnota} value={s.hodnota}>
                    {s.popisek}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex items-end gap-3 sm:col-span-2 lg:col-span-4">
              <Button type="submit" variant="secondary">
                Filtrovat
              </Button>
              {jeFiltrovano ? (
                <Button type="button" variant="ghost" asChild>
                  <Link href="/zarizeni">Zrušit filtr</Link>
                </Button>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      {zarizeni.length === 0 ? (
        <Card>
          <CardContent className="space-y-2 py-10 text-center">
            <p className="font-medium">
              {jeFiltrovano ? 'Filtru neodpovídá žádné zařízení.' : 'Zatím tu není žádné zařízení.'}
            </p>
            <p className="text-sm text-muted-foreground">
              {jeFiltrovano
                ? 'Zkuste hledání zúžit nebo filtr zrušte.'
                : smiSpravovat
                  ? 'Založte první stroj tlačítkem výše.'
                  : 'Evidenci plní garant vaší oblasti.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Zařízení</th>
                  <th className="px-4 py-3 font-medium">Inventární číslo</th>
                  <th className="px-4 py-3 font-medium">Typ</th>
                  <th className="px-4 py-3 font-medium">Umístění</th>
                  <th className="px-4 py-3 font-medium">Stav</th>
                  {/* Sloupec s akcí se vůbec nevykreslí těm, kdo evidenci měnit
                      nesmějí - prázdný sloupec by jen zabíral místo. */}
                  {smiSpravovat ? (
                    <th className="px-4 py-3 text-right font-medium">
                      <span className="sr-only">Akce</span>
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {zarizeni.map((z) => (
                  <tr key={z.id} className="border-b last:border-0 hover:bg-accent/50">
                    <td className="px-4 py-3">
                      <Link href={`/zarizeni/${z.id}`} className="font-medium hover:underline">
                        {z.nazev}
                      </Link>
                      {z.vyrobce || z.model ? (
                        <p className="text-xs text-muted-foreground">
                          {[z.vyrobce, z.model].filter(Boolean).join(' · ')}
                        </p>
                      ) : null}
                    </td>
                    <td className="cislice-tabulkove px-4 py-3">
                      {z.inventarni_cislo ?? <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3">{z.typ?.nazev ?? '—'}</td>
                    <td className="px-4 py-3">{z.umisteni?.nazev ?? '—'}</td>
                    <td className="px-4 py-3">
                      <ZnackaStavu stav={z.stav} />
                    </td>
                    {smiSpravovat ? (
                      <td className="px-4 py-3 text-right">
                        <Button asChild variant="ghost" size="sm">
                          <Link href={`/zarizeni/${z.id}/upravit`}>
                            Upravit
                            {/* Bez názvu stroje by odečítač obrazovky přečetl
                                jen řadu stejných „Upravit". */}
                            <span className="sr-only"> {z.nazev}</span>
                          </Link>
                        </Button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}

