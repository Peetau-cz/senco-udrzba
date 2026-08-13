import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ZnackaStavu } from '@/components/zarizeni/znacka-stavu'
import { maPravo } from '@/lib/auth/opravneni'
import { nactiPrihlaseneho } from '@/lib/auth/session'
import { formatDatumCas } from '@/lib/datum'
import { nactiZarizeni } from '@/lib/zarizeni/dotazy'
import { popisekParametru, prectiSchema, zobrazHodnotu } from '@/lib/zarizeni/parametry'
import type { HodnotyParametru } from '@/lib/zarizeni/parametry'

const ZALOZKY = [
  { klic: 'prehled', popisek: 'Přehled' },
  { klic: 'plan', popisek: 'Plán údržby' },
  { klic: 'historie', popisek: 'Historie' },
  { klic: 'dokumenty', popisek: 'Dokumenty' },
  { klic: 'parametry', popisek: 'Parametry' },
] as const

type KlicZalozky = (typeof ZALOZKY)[number]['klic']

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const zarizeni = await nactiZarizeni(id)

  return { title: zarizeni?.nazev ?? 'Zařízení' }
}

/**
 * Karta zařízení podle wireframu v docs/NAVRH.md kap. 5.4.
 *
 * Záložky jsou obyčejné odkazy s parametrem v adrese, ne přepínání v prohlížeči.
 * Konkrétní záložka jde tím pádem poslat kolegovi odkazem a funguje i na tabletu
 * bez javascriptu. Plán, historie a dokumenty čekají na moduly M3, M5 a na
 * dokončení M1 - jejich záložky tu jsou, aby bylo vidět, kam obsah přijde.
 */
export default async function KartaZarizeni({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const uzivatel = await nactiPrihlaseneho()
  if (!uzivatel) redirect('/login')

  const { id } = await params
  const zarizeni = await nactiZarizeni(id)

  // Cizí oblast RLS odfiltruje a dotaz nevrátí nic. Pro uživatele je to totéž
  // jako neexistující stroj - a je to tak správně, existenci neprozrazujeme.
  if (!zarizeni) notFound()

  const parametryAdresy = await searchParams
  const pozadovana = parametryAdresy.zalozka
  const zalozka: KlicZalozky = ZALOZKY.some((z) => z.klic === pozadovana)
    ? (pozadovana as KlicZalozky)
    : 'prehled'

  const smiUpravovat = maPravo(uzivatel.role, 'zarizeni', 'zapis')
  const schema = prectiSchema(zarizeni.typ?.schema_parametru)
  const hodnoty = (zarizeni.parametry ?? {}) as HodnotyParametru

  const odpovedny = zarizeni.odpovedny
    ? [celeJmeno(zarizeni.odpovedny), zarizeni.odpovedny.email].find(Boolean)
    : null

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <Link href="/zarizeni" className="text-sm text-muted-foreground hover:underline">
            ‹ Zařízení
          </Link>
          <h1 className="text-2xl font-semibold">{zarizeni.nazev}</h1>
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {zarizeni.inventarni_cislo ? (
              <span className="cislice-tabulkove">inv. č. {zarizeni.inventarni_cislo}</span>
            ) : (
              <span>bez inventárního čísla</span>
            )}
            <span>·</span>
            <span>{zarizeni.typ?.nazev ?? 'bez typu'}</span>
            <span>·</span>
            <span>{zarizeni.oblast?.nazev}</span>
            <span>·</span>
            <span>{zarizeni.umisteni?.nazev ?? 'umístění neurčeno'}</span>
            <ZnackaStavu stav={zarizeni.stav} />
          </p>
        </div>

        {smiUpravovat ? (
          <Button asChild size="dotyk" variant="outline">
            <Link href={`/zarizeni/${zarizeni.id}/upravit`}>Upravit</Link>
          </Button>
        ) : null}
      </div>

      <nav className="flex flex-wrap gap-1 border-b" aria-label="Části karty zařízení">
        {ZALOZKY.map((z) => {
          const jeAktivni = z.klic === zalozka
          return (
            <Link
              key={z.klic}
              href={`/zarizeni/${zarizeni.id}?zalozka=${z.klic}`}
              aria-current={jeAktivni ? 'page' : undefined}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                jeAktivni
                  ? 'border-zvyrazneni text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {z.popisek}
            </Link>
          )
        })}
      </nav>

      {zalozka === 'prehled' ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Výrobní štítek</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                <Udaj popisek="Výrobce" hodnota={zarizeni.vyrobce} />
                <Udaj popisek="Model" hodnota={zarizeni.model} />
                <Udaj popisek="Výrobní číslo" hodnota={zarizeni.vyrobni_cislo} />
                <Udaj popisek="Rok výroby" hodnota={zarizeni.rok_vyroby?.toString()} />
                <Udaj popisek="Odpovědná osoba" hodnota={odpovedny} />
                <Udaj popisek="Umístění" hodnota={zarizeni.umisteni?.nazev} />
              </dl>

              {zarizeni.poznamka ? (
                <div className="mt-6 border-t pt-4">
                  <p className="text-xs text-muted-foreground">Poznámka</p>
                  <p className="mt-1 whitespace-pre-line text-sm">{zarizeni.poznamka}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Nejbližší údržba</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Doplní modul M3.</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Poslední údržba</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Doplní modul M5.</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-1 pt-6 text-xs text-muted-foreground">
                <p>Založeno {formatDatumCas(zarizeni.vytvoreno_at)}</p>
                <p>Naposledy změněno {formatDatumCas(zarizeni.zmeneno_at)}</p>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}

      {zalozka === 'parametry' ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Vlastní technické parametry</CardTitle>
            <CardDescription>
              Určuje je typ <strong>{zarizeni.typ?.nazev}</strong>, ne pevný seznam v kódu.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {Object.keys(schema).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Tento typ zatím nemá určené žádné parametry. Doplní je garant oblasti.
              </p>
            ) : (
              <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                {Object.entries(schema).map(([klic, definice]) => (
                  <Udaj
                    key={klic}
                    popisek={popisekParametru(klic, definice)}
                    hodnota={zobrazHodnotu(definice, hodnoty[klic] ?? null)}
                  />
                ))}
              </dl>
            )}
          </CardContent>
        </Card>
      ) : null}

      {zalozka === 'plan' || zalozka === 'historie' || zalozka === 'dokumenty' ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {ZALOZKY.find((z) => z.klic === zalozka)?.popisek}
            </CardTitle>
            <CardDescription>{POPIS_PRAZDNE[zalozka]}</CardDescription>
          </CardHeader>
        </Card>
      ) : null}
    </div>
  )
}

const POPIS_PRAZDNE: Record<'plan' | 'historie' | 'dokumenty', string> = {
  plan: 'Plán úkonů podle šablony doplní moduly M2 a M3.',
  historie: 'Provedené údržby a zápisy z deníku doplní moduly M3 a M5.',
  dokumenty: 'Fotky, návody a certifikáty přijdou s dokončením modulu M1.',
}

function Udaj({ popisek, hodnota }: { popisek: string; hodnota?: string | null }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{popisek}</dt>
      <dd className="mt-0.5 text-sm">{hodnota || '—'}</dd>
    </div>
  )
}

function celeJmeno(osoba: { jmeno?: string | null; prijmeni?: string | null }): string {
  return [osoba.jmeno, osoba.prijmeni].filter(Boolean).join(' ').trim()
}
