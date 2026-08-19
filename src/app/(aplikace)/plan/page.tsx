import Link from 'next/link'
import { CalendarClock, ChevronRight } from 'lucide-react'
import { redirect } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { ZnackaTerminu } from '@/components/plan/znacka-terminu'
import { nactiPrihlaseneho } from '@/lib/auth/session'
import {
  celeJmeno,
  nactiZakazky,
  postupZakazky,
  type PohledPlanu,
} from '@/lib/plan/dotazy'
import { dnesVPraze, procentoHotovo } from '@/lib/plan/terminy'
import { formatDatum } from '@/lib/datum'

export const metadata = { title: 'Plán údržby' }

type Parametry = Record<string, string | string[] | undefined>

function jedna(parametry: Parametry, klic: string): string | undefined {
  const hodnota = parametry[klic]
  return typeof hodnota === 'string' && hodnota !== '' ? hodnota : undefined
}

const POHLEDY: { klic: PohledPlanu; popisek: string; prazdno: string }[] = [
  {
    klic: 'otevrene',
    popisek: 'Rozdělané',
    prazdno: 'Nic není naplánované. Zakázky zakládá noční úloha podle plánu jednotlivých strojů.',
  },
  {
    klic: 'po_terminu',
    popisek: 'Po termínu',
    prazdno: 'Nic není po termínu.',
  },
  {
    klic: 'dokoncene',
    popisek: 'Hotové',
    prazdno: 'Zatím nebyla dokončená žádná údržba.',
  },
]

/**
 * Plán údržby (modul M3).
 *
 * Seznam zakázek, ne jednotlivých úkonů: zakázka je jedna cesta technika ke
 * stroji, a právě to je jednotka práce, kterou si někdo bere. Rozpad na kroky
 * je až v checklistu.
 *
 * Oblast se nefiltruje vlastním polem - používá se přepínač v hlavičce, stejně
 * jako u zařízení a šablon.
 */
export default async function StrankaPlan({
  searchParams,
}: {
  searchParams: Promise<Parametry>
}) {
  const uzivatel = await nactiPrihlaseneho()
  if (!uzivatel) redirect('/login')

  const parametry = await searchParams
  const kodOblasti = jedna(parametry, 'oblast')
  const oblast = uzivatel.oblasti.find((o) => o.kod === kodOblasti)

  const pozadovany = jedna(parametry, 'pohled')
  const pohled: PohledPlanu = POHLEDY.some((p) => p.klic === pozadovany)
    ? (pozadovany as PohledPlanu)
    : 'otevrene'

  const jenMoje = jedna(parametry, 'moje') === '1'
  const dnes = dnesVPraze()

  const zakazky = await nactiZakazky(
    {
      pohled,
      oblastId: oblast?.id,
      uzivatelId: jenMoje ? uzivatel.id : undefined,
    },
    dnes,
  )

  const nastaveni = POHLEDY.find((p) => p.klic === pohled)!

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Plán údržby</h1>
        <p className="text-muted-foreground">
          {zakazky.length === 0
            ? 'Jedna zakázka je jedna cesta technika ke stroji.'
            : `Celkem: ${zakazky.length}. Klepnutím na řádek otevřete checklist.`}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <nav className="flex flex-wrap gap-1 border-b" aria-label="Pohledy na plán">
          {POHLEDY.map((p) => {
            const jeAktivni = p.klic === pohled
            return (
              <Link
                key={p.klic}
                href={odkaz(parametry, { pohled: p.klic })}
                aria-current={jeAktivni ? 'page' : undefined}
                className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                  jeAktivni
                    ? 'border-zvyrazneni text-zvyrazneni'
                    : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
                }`}
              >
                {p.popisek}
              </Link>
            )
          })}
        </nav>

        <Link
          href={odkaz(parametry, { moje: jenMoje ? undefined : '1' })}
          className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
            jenMoje
              ? 'bg-zvyrazneni text-zvyrazneni-foreground'
              : 'bg-secondary text-secondary-foreground hover:bg-accent'
          }`}
        >
          Jen moje
        </Link>
      </div>

      {zakazky.length === 0 ? (
        <Card>
          <div className="py-10 text-center">
            <CalendarClock aria-hidden="true" className="mx-auto mb-4 h-10 w-10 text-zvyrazneni/40" />
            <p className="font-medium">{nastaveni.prazdno}</p>
            <p className="mx-auto mt-1 max-w-lg text-sm text-muted-foreground">
              Zakázka vznikne, až bude mít úkon v plánu stroje zadaný termín. Termíny se zadávají
              na kartě zařízení, záložka Plán údržby.
            </p>
          </div>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Zařízení</th>
                  <th className="px-4 py-3 font-medium">Profese</th>
                  <th className="px-4 py-3 font-medium">Postup</th>
                  <th className="px-4 py-3 font-medium">
                    {pohled === 'dokoncene' ? 'Dokončeno' : 'Termín'}
                  </th>
                  <th className="px-4 py-3 font-medium">Přiřazeno</th>
                  <th className="px-4 py-3 text-right font-medium">
                    <span className="sr-only">Otevřít</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {zakazky.map((z) => {
                  const { hotovo, celkem } = postupZakazky(z)
                  const osoba = celeJmeno(z.prirazeno)

                  return (
                    <tr
                      key={z.id}
                      className="relative cursor-pointer border-b transition-colors last:border-0 focus-within:bg-accent hover:bg-accent"
                    >
                      <td className="px-4 py-3">
                        {/* Odkaz je jen na jedné buňce, ale roztažený přes celý
                            řádek - vnořený odkaz v každé buňce by čtečce hlásil
                            šest odkazů na totéž. Stejně jako v seznamu šablon. */}
                        <Link
                          href={`/zakazky/${z.id}`}
                          className="rounded-sm font-medium underline-offset-4 after:absolute after:inset-0 hover:underline focus-visible:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {z.zarizeni?.nazev ?? 'neznámé zařízení'}
                        </Link>
                        <span className="cislice-tabulkove block text-xs text-muted-foreground">
                          {z.zarizeni?.inventarni_cislo ?? 'bez inv. čísla'}
                          {z.zarizeni?.oblast?.nazev ? ` · ${z.zarizeni.oblast.nazev}` : ''}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-muted-foreground">
                        {z.profese?.nazev ?? '—'}
                      </td>

                      <td className="cislice-tabulkove px-4 py-3">
                        {hotovo} z {celkem}
                        <span className="ml-2 text-xs text-muted-foreground">
                          {procentoHotovo(hotovo, celkem)} %
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        {pohled === 'dokoncene' ? (
                          <span className="text-muted-foreground">
                            {formatDatum(z.dokonceno_at)}
                          </span>
                        ) : (
                          <div className="space-y-1">
                            <ZnackaTerminu termin={z.planovany_termin} dnes={dnes} />
                            <span className="cislice-tabulkove block text-xs text-muted-foreground">
                              {formatDatum(z.planovany_termin)}
                            </span>
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3 text-muted-foreground">{osoba || 'nikomu'}</td>

                      <td className="px-4 py-3 text-right">
                        <ChevronRight
                          aria-hidden="true"
                          className="ml-auto h-4 w-4 text-muted-foreground"
                        />
                      </td>
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

/** Odkaz na tutéž stránku se změněnými parametry. Nezadané se vypouštějí. */
function odkaz(puvodni: Parametry, zmeny: Record<string, string | undefined>): string {
  const parametry = new URLSearchParams()

  for (const [klic, hodnota] of Object.entries(puvodni)) {
    if (typeof hodnota === 'string' && hodnota) parametry.set(klic, hodnota)
  }

  for (const [klic, hodnota] of Object.entries(zmeny)) {
    if (hodnota) {
      parametry.set(klic, hodnota)
    } else {
      parametry.delete(klic)
    }
  }

  const dotaz = parametry.toString()
  return dotaz ? `/plan?${dotaz}` : '/plan'
}
