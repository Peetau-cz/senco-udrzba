import Link from 'next/link'
import { ChevronRight, Layers, Plus } from 'lucide-react'
import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ZnackaVerze } from '@/components/sablony/znacka-verze'
import { maPravo } from '@/lib/auth/opravneni'
import { nactiPrihlaseneho } from '@/lib/auth/session'
import { aktivniVerze, nactiSablony, pocetZarizeniSablony } from '@/lib/sablony/dotazy'

export const metadata = { title: 'Šablony údržby' }

type Parametry = Record<string, string | string[] | undefined>

function jedna(parametry: Parametry, klic: string): string | undefined {
  const hodnota = parametry[klic]
  return typeof hodnota === 'string' && hodnota !== '' ? hodnota : undefined
}

/**
 * Seznam šablon údržby (modul M2).
 *
 * Oblast se nefiltruje vlastním polem - používá se přepínač v hlavičce, stejně
 * jako u zařízení.
 */
export default async function StrankaSablony({
  searchParams,
}: {
  searchParams: Promise<Parametry>
}) {
  const uzivatel = await nactiPrihlaseneho()
  if (!uzivatel) redirect('/login')

  const parametry = await searchParams
  const kodOblasti = jedna(parametry, 'oblast')
  const oblast = uzivatel.oblasti.find((o) => o.kod === kodOblasti)

  const smiSpravovat = maPravo(uzivatel.role, 'sablony', 'zapis')

  // Vyřazené šablony vidí jen ten, kdo je smí spravovat - pro ostatní je to
  // jen šum, stroje na ně už nemají být napojené.
  const sablony = await nactiSablony({
    oblastId: oblast?.id,
    vcetneNeaktivnich: smiSpravovat,
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Šablony údržby</h1>
          <p className="text-muted-foreground">
            {sablony.length === 0
              ? 'Šablona popisuje, co a jak často se na stroji dělá.'
              : `Celkem: ${sablony.length}. Klepnutím na řádek otevřete matici.`}
          </p>
        </div>

        {smiSpravovat ? (
          <Button asChild size="dotyk">
            <Link href="/sablony/nova">
              <Plus aria-hidden="true" className="h-4 w-4" />
              Nová šablona
            </Link>
          </Button>
        ) : null}
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="hlavicka-tabulky">
              <tr>
                <th className="px-4 py-3 font-medium">Šablona</th>
                <th className="px-4 py-3 font-medium">Oblast</th>
                <th className="px-4 py-3 font-medium">Platná verze</th>
                <th className="px-4 py-3 font-medium">Zařízení</th>
                <th className="px-4 py-3 font-medium">
                  <span className="sr-only">Otevřít</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sablony.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center">
                    <Layers
                      aria-hidden="true"
                      className="mx-auto mb-4 h-10 w-10 text-zvyrazneni/40"
                    />
                    <p className="font-medium">Zatím tu není žádná šablona.</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {smiSpravovat
                        ? 'Jedna šablona se přiřazuje všem strojům stejného typu — nezakládejte ji pro každý kus zvlášť.'
                        : 'Šablony připravuje garant vaší oblasti.'}
                    </p>
                  </td>
                </tr>
              ) : (
                sablony.map((s) => {
                  const platna = aktivniVerze(s.verze ?? [])
                  const pocet = pocetZarizeniSablony(s)

                  return (
                    <tr
                      key={s.id}
                      className="group relative cursor-pointer border-b transition-colors last:border-0 focus-within:bg-accent hover:bg-accent"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/sablony/${s.id}`}
                          className="rounded-sm font-medium underline-offset-4 after:absolute after:inset-0 hover:underline focus-visible:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {s.nazev}
                        </Link>
                        <p className="cislice-tabulkove text-xs text-muted-foreground">
                          {s.kod}
                          {!s.aktivni ? ' · nenabízí se' : ''}
                        </p>
                      </td>
                      <td className="px-4 py-3">{s.oblast?.nazev ?? '—'}</td>
                      <td className="px-4 py-3">
                        {platna ? (
                          <span className="inline-flex items-center gap-2">
                            <span className="cislice-tabulkove">verze {platna.cislo_verze}</span>
                            <ZnackaVerze stav="aktivni" />
                          </span>
                        ) : (
                          // Šablona bez platné verze se nedá naplánovat. Je to
                          // běžný mezistav (rozdělaný návrh), ne chyba.
                          <span className="text-muted-foreground">zatím žádná</span>
                        )}
                      </td>
                      <td className="cislice-tabulkove px-4 py-3">
                        {pocet === 0 ? <span className="text-muted-foreground">—</span> : pocet}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        <ChevronRight
                          aria-hidden="true"
                          className="ml-auto h-5 w-5 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
                        />
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
