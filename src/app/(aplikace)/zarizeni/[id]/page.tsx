import type { ReactNode } from 'react'
import Link from 'next/link'
import {
  CalendarClock,
  Cog,
  Hash,
  History,
  MapPin,
  NotebookPen,
  Paperclip,
  SlidersHorizontal,
  Tag,
  Upload,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { notFound, redirect } from 'next/navigation'
import { OdkazZpet } from '@/components/layout/odkaz-zpet'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CasovaOsa } from '@/components/denik/casova-osa'
import { TerminyPlanu } from '@/components/plan/terminy-planu'
import { NahraniSouboru } from '@/components/zarizeni/nahrani-souboru'
import { SeznamSouboru } from '@/components/zarizeni/seznam-souboru'
import { ZnackaStavu } from '@/components/zarizeni/znacka-stavu'
import { maPravo } from '@/lib/auth/opravneni'
import { nactiPrihlaseneho } from '@/lib/auth/session'
import { formatDatum, formatDatumCas } from '@/lib/datum'
import { nactiHistoriiZarizeni } from '@/lib/denik/dotazy'
import { nactiPlanZarizeni } from '@/lib/plan/dotazy'
import { dnesVPraze } from '@/lib/plan/terminy'
import { cestaUmisteni } from '@/lib/umisteni/zobrazeni'
import { nactiSouboryZarizeni, nactiZarizeni } from '@/lib/zarizeni/dotazy'
import { ulozTerminy } from './plan-actions'
import { nahrajSoubor, smazSoubor } from './soubory-actions'
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
 * bez javascriptu.
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
  // Plán má v matici oprávnění vlastní řádek. Dnes vychází stejně jako evidence,
  // ale ptáme se na něj zvlášť - kdyby se pravidla rozešla, změní se matice
  // a nikoli tahle stránka.
  const smiPlanovat = maPravo(uzivatel.role, 'plan', 'zapis')
  const smiZapisovatDoDeniku = maPravo(uzivatel.role, 'denik', 'zapis')
  const schema = prectiSchema(zarizeni.typ?.schema_parametru)
  const hodnoty = (zarizeni.parametry ?? {}) as HodnotyParametru

  // Načítá se i pro přehled, ne jen pro záložku Dokumenty - první fotka patří
  // rovnou na kartu, jak to má wireframe v kap. 5.4.
  const soubory = await nactiSouboryZarizeni(zarizeni.id)
  const fotka = soubory.find((s) => s.druh === 'foto' && s.odkaz)

  const odpovedny = zarizeni.odpovedny
    ? [celeJmeno(zarizeni.odpovedny), zarizeni.odpovedny.email].find(Boolean)
    : null

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <OdkazZpet href="/zarizeni" popisek="Zařízení" />
          <h1 className="text-2xl font-semibold">{zarizeni.nazev}</h1>
          {/* Dřív to byla šedá řádka oddělovaná tečkami - všechno stejně důležité
              a nic nečitelné na první pohled. Štítky dají každému údaji vlastní
              plochu a ikonu; barvu nesou jen ikony, aby text zůstal klidný. */}
          <div className="flex flex-wrap items-center gap-2">
            <Stitek ikona={Hash} cislice>
              {zarizeni.inventarni_cislo
                ? `inv. č. ${zarizeni.inventarni_cislo}`
                : 'bez inventárního čísla'}
            </Stitek>
            <Stitek ikona={Cog}>{zarizeni.typ?.nazev ?? 'bez typu'}</Stitek>
            {zarizeni.oblast?.nazev ? <Stitek ikona={Users}>{zarizeni.oblast.nazev}</Stitek> : null}
            <Stitek ikona={MapPin}>{cestaUmisteni(zarizeni.umisteni, 'umístění neurčeno')}</Stitek>
            <ZnackaStavu stav={zarizeni.stav} />
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          {/* Zásah se zapisuje od stroje, ne od prázdného formuláře - technik
              stojí u mašiny a nemá ji proč hledat v seznamu podruhé. */}
          {smiZapisovatDoDeniku ? (
            <Button asChild size="dotyk" variant="outline">
              <Link href={`/denik/novy?zarizeni=${zarizeni.id}`}>
                <NotebookPen aria-hidden="true" className="h-4 w-4" />
                Zapsat zásah
              </Link>
            </Button>
          ) : null}

          {smiUpravovat ? (
            <Button asChild size="dotyk" variant="outline">
              <Link href={`/zarizeni/${zarizeni.id}/upravit`}>Upravit</Link>
            </Button>
          ) : null}
        </div>
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
                  ? 'border-zvyrazneni text-zvyrazneni'
                  : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
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
              <CardTitle className="flex items-center gap-2 text-base">
                <Tag aria-hidden="true" className="h-4 w-4 text-zvyrazneni" />
                Výrobní štítek
              </CardTitle>
            </CardHeader>
            <CardContent>
              {fotka?.odkaz ? (
                // Prosté <img>: odkaz je podepsaný a po hodině vyprší, takže by
                // ho optimalizátor obrázků stejně neměl jak uložit do cache.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={fotka.odkaz}
                  alt={`Fotka zařízení ${zarizeni.nazev}`}
                  className="mb-6 max-h-64 w-full rounded-md border object-contain"
                />
              ) : null}

              <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                <Udaj popisek="Výrobce" hodnota={zarizeni.vyrobce} />
                <Udaj popisek="Model" hodnota={zarizeni.model} />
                <Udaj popisek="Výrobní číslo" hodnota={zarizeni.vyrobni_cislo} />
                <Udaj popisek="Rok výroby" hodnota={zarizeni.rok_vyroby?.toString()} />
                <Udaj popisek="Odpovědná osoba" hodnota={odpovedny} />
                <Udaj popisek="Umístění" hodnota={cestaUmisteni(zarizeni.umisteni)} />
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
            {/* Proužky používají barvy stavů údržby, ne libovolné odstíny:
                plán je fialový jako „dnešní plán", hotová práce zelená. */}
            <KartaNejblizsiUdrzby zarizeniId={zarizeni.id} />
            <KartaNaposledy zarizeniId={zarizeni.id} />

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
            <CardTitle className="flex items-center gap-2 text-base">
              <SlidersHorizontal aria-hidden="true" className="h-4 w-4 text-zvyrazneni" />
              Vlastní technické parametry
            </CardTitle>
            <CardDescription>
              Určuje je typ <strong>{zarizeni.typ?.nazev}</strong>, ne pevný seznam v kódu.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {Object.keys(schema).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Tento typ zatím nemá určené žádné parametry.{' '}
                {smiUpravovat && zarizeni.typ ? (
                  <Link href={`/zarizeni/typy/${zarizeni.typ.id}`} className="underline">
                    Doplňte je u typu {zarizeni.typ.nazev}
                  </Link>
                ) : (
                  'Doplní je garant oblasti.'
                )}
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

      {zalozka === 'dokumenty' ? (
        <div className="space-y-4">
          {smiUpravovat ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Upload aria-hidden="true" className="h-4 w-4 text-zvyrazneni" />
                  Nahrát soubor
                </CardTitle>
                <CardDescription>
                  Fotka stroje, návod k obsluze nebo certifikát. Soubory vidí každý, kdo vidí
                  zařízení; měnit je smí garant oblasti.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <NahraniSouboru akce={nahrajSoubor.bind(null, zarizeni.id)} />
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Paperclip aria-hidden="true" className="h-4 w-4 text-zvyrazneni" />
                Přílohy
              </CardTitle>
            </CardHeader>
            <CardContent>
              <SeznamSouboru
                soubory={soubory}
                zarizeniId={zarizeni.id}
                smiSpravovat={smiUpravovat}
                smazAkce={smazSoubor}
              />
            </CardContent>
          </Card>
        </div>
      ) : null}

      {zalozka === 'plan' ? <ZalozkaPlan zarizeniId={zarizeni.id} smiUpravovat={smiPlanovat} /> : null}

      {zalozka === 'historie' ? (
        <ZalozkaHistorie zarizeniId={zarizeni.id} smiZapisovat={smiZapisovatDoDeniku} />
      ) : null}
    </div>
  )
}

// -----------------------------------------------------------------------------
// Historie
// -----------------------------------------------------------------------------

/**
 * Kompletní historie stroje (zadání ř. 146-154).
 *
 * Obě poloviny slévá pohled v_historie_zarizeni z migrace 0023 - dokončené
 * zakázky i zápisy z deníku. Otevřená ani zrušená zakázka tu není: první je
 * práce, která se má teprve udělat, druhá práce, která se neudělala.
 */
async function ZalozkaHistorie({
  zarizeniId,
  smiZapisovat,
}: {
  zarizeniId: string
  smiZapisovat: boolean
}) {
  const udalosti = await nactiHistoriiZarizeni(zarizeniId)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History aria-hidden="true" className="h-4 w-4 text-zvyrazneni" />
          Historie
        </CardTitle>
        <CardDescription>
          Dokončené údržby a zápisy z provozního deníku v jedné časové ose, od nejnovějšího.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {udalosti.length === 0 ? (
          <div className="py-10 text-center">
            <History aria-hidden="true" className="mx-auto mb-4 h-10 w-10 text-zvyrazneni/40" />
            <p className="font-medium">Se strojem se zatím nic nedělo.</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              Objeví se tu dokončené údržby z plánu i neplánované zásahy.{' '}
              {smiZapisovat ? (
                <Link
                  href={`/denik/novy?zarizeni=${zarizeniId}`}
                  className="underline underline-offset-4"
                >
                  Zapsat zásah
                </Link>
              ) : null}
            </p>
          </div>
        ) : (
          <CasovaOsa udalosti={udalosti} />
        )}
      </CardContent>
    </Card>
  )
}

/** Nejbližší termín z plánu. Řádky bez termínu plánovač přeskakuje (migrace 0010). */
async function KartaNejblizsiUdrzby({ zarizeniId }: { zarizeniId: string }) {
  const radky = await nactiPlanZarizeni(zarizeniId)

  const nejblizsi = radky
    .filter((r) => r.aktivni && r.dalsiTermin)
    .sort((a, b) => (a.dalsiTermin ?? '').localeCompare(b.dalsiTermin ?? ''))[0]

  return (
    <Card className="border-l-4 border-l-stav-dnes">
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-2">
          <CalendarClock aria-hidden="true" className="h-4 w-4 text-stav-dnes" />
          Nejbližší údržba
        </CardDescription>
      </CardHeader>
      <CardContent>
        {nejblizsi ? (
          <>
            <p className="font-medium">{formatDatum(nejblizsi.dalsiTermin)}</p>
            <p className="text-sm text-muted-foreground">
              {nejblizsi.ukon?.nazev ?? nejblizsi.sablonaNazev}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            {radky.length === 0
              ? 'Stroj nemá přiřazenou šablonu údržby.'
              : 'Plán čeká na termíny od garanta.'}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * Co se se strojem dělo naposledy - údržba i zásah z deníku dohromady.
 *
 * Karta se dřív jmenovala „Poslední údržba", ale u stroje se nikdo neptá,
 * co bylo v plánu; ptá se, co se s ním dělo. Odpovědí je nejnovější událost
 * z historie bez ohledu na to, ze které poloviny přišla.
 */
async function KartaNaposledy({ zarizeniId }: { zarizeniId: string }) {
  const [posledni] = await nactiHistoriiZarizeni(zarizeniId, 1)

  return (
    <Card className="border-l-4 border-l-stav-splneno">
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-2">
          <History aria-hidden="true" className="h-4 w-4 text-stav-splneno" />
          Naposledy se dělo
        </CardDescription>
      </CardHeader>
      <CardContent>
        {posledni ? (
          <>
            <p className="font-medium">{posledni.nazev}</p>
            <p className="text-sm text-muted-foreground">
              {formatDatum(posledni.kdy)} ·{' '}
              {posledni.puvod === 'udrzba' ? 'plánovaná údržba' : 'zásah z deníku'}
            </p>
            <Link
              href={`/zarizeni/${zarizeniId}?zalozka=historie`}
              className="mt-2 inline-block text-sm underline underline-offset-4"
            >
              Celá historie
            </Link>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Se strojem se zatím nic nedělo.</p>
        )}
      </CardContent>
    </Card>
  )
}

// -----------------------------------------------------------------------------
// Plán údržby
// -----------------------------------------------------------------------------

/**
 * Co se na stroji má dělat a kdy.
 *
 * Řádky plánu zakládá databáze sama při přiřazení šablony a při vydání nové
 * verze (migrace 0010). Prázdný plán proto neznamená „ještě se nenačetl", ale
 * že stroj nemá přiřazenou šablonu s platnou verzí - a to je jediné, co s tím
 * jde dělat.
 */
async function ZalozkaPlan({
  zarizeniId,
  smiUpravovat,
}: {
  zarizeniId: string
  smiUpravovat: boolean
}) {
  const radky = await nactiPlanZarizeni(zarizeniId)

  if (radky.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <CalendarClock aria-hidden="true" className="mx-auto mb-4 h-10 w-10 text-zvyrazneni/40" />
          <p className="font-medium">Stroj zatím nemá co plánovat.</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Plán vznikne sám, jakmile stroj dostane šablonu údržby s aktivovanou verzí.{' '}
            {smiUpravovat ? (
              <Link href="/sablony" className="underline underline-offset-4">
                Přiřadit šablonu
              </Link>
            ) : (
              'Přiřazuje ji garant oblasti.'
            )}
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock aria-hidden="true" className="h-4 w-4 text-zvyrazneni" />
          Plán údržby
        </CardTitle>
        <CardDescription>
          Kdy se má který úkon dělat příště. První termín zadává garant u každého úkonu zvlášť —
          nedopočítává se z data přiřazení, protože kalendář údržby si určuje provoz, ne systém.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <TerminyPlanu
          radky={radky}
          dnes={dnesVPraze()}
          smiUpravovat={smiUpravovat}
          akce={ulozTerminy.bind(null, zarizeniId)}
        />
      </CardContent>
    </Card>
  )
}

/**
 * Štítek s jedním údajem v hlavičce karty.
 *
 * Podklad je neutrální (`secondary`), barvu nese jen ikona - kdyby se barvily
 * i plochy, hlavička by přebila odznak stavu, který barvou opravdu něco říká.
 */
function Stitek({
  ikona: Ikona,
  cislice = false,
  children,
}: {
  ikona: LucideIcon
  cislice?: boolean
  children: ReactNode
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md bg-secondary px-2 py-1 text-xs text-secondary-foreground ${
        cislice ? 'cislice-tabulkove' : ''
      }`}
    >
      <Ikona aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-zvyrazneni" />
      {children}
    </span>
  )
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
