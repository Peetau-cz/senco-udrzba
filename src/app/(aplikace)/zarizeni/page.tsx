import Link from 'next/link'
import { ChevronRight, Cog, MapPin, PackageSearch, Plus } from 'lucide-react'
import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { HlavickaTabulkyZarizeni } from '@/components/zarizeni/hlavicka-tabulky-zarizeni'
import { ZnackaStavu } from '@/components/zarizeni/znacka-stavu'
import { cestaUmisteni, idsUmisteniProFiltr } from '@/lib/umisteni/zobrazeni'
import { maPravo } from '@/lib/auth/opravneni'
import { nactiPrihlaseneho } from '@/lib/auth/session'
import { nactiCiselniky, nactiSeznamZarizeni } from '@/lib/zarizeni/dotazy'
import { STAVY_ZARIZENI } from '@/lib/zarizeni/formular'

/**
 * Formulář filtru stojí mimo tabulku a políčka se k němu hlásí atributem
 * `form`. Prohlížeč totiž `<form>` vložený mezi `<table>` a `<tr>` vyhodí ven
 * a vstupy by osiřely. Tenhle způsob je součástí HTML a funguje i bez
 * javascriptu - filtr se odešle Enterem nebo lupou vpravo v hlavičce.
 */
const ID_FILTRU = 'filtr-zarizeni'

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
  const kodUmisteni = jedna(parametry, 'umisteni')
  const stav = jedna(parametry, 'stav')
  const hledanyNazev = jedna(parametry, 'nazev')
  const hledaneCislo = jedna(parametry, 'inv')

  const oblast = uzivatel.oblasti.find((o) => o.kod === kodOblasti)
  const typ = ciselniky.typy.find((t) => t.kod === kodTypu)

  const zarizeni = await nactiSeznamZarizeni({
    oblastId: oblast?.id,
    typId: typ?.id,
    stav,
    nazev: hledanyNazev,
    inventarniCislo: hledaneCislo,
    umisteniIds: idsUmisteniProFiltr(ciselniky.umisteni, kodUmisteni),
  })

  const smiSpravovat = maPravo(uzivatel.role, 'zarizeni', 'zapis')

  // Oblast se schválně nepočítá: tu drží přepínač v hlavičce, ne filtr v
  // tabulce. Kdyby ji „Zrušit filtr" mazalo taky, uživatel by nečekaně vypadl
  // z oblasti, kterou si nastavil úplně jinde.
  const jeFiltrovano = Boolean(kodTypu || kodUmisteni || stav || hledanyNazev || hledaneCislo)

  // Prázdný stav se roztahuje přes všechny sloupce, ať zpráva stojí uprostřed
  // tabulky a ne v prvním sloupci.
  const pocetSloupcu = smiSpravovat ? 7 : 6

  return (
    <div className="space-y-6">
      {/* Akce patří do hlavičky vedle nadpisu, ne pod filtr - tam se pletly mezi
          filtrování a tabulku a nebylo poznat, ke které z nich patří. */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Zařízení</h1>
          {/* Při zapnutém filtru už to není „celkem" - číslo se mění pod rukama
              podle toho, co je v hlavičce zadané. */}
          <p className="text-muted-foreground">
            {zarizeni.length === 0
              ? 'Evidence strojů a jejich technických údajů.'
              : `${jeFiltrovano ? 'Nalezeno' : 'Celkem'}: ${zarizeni.length}. Klepnutím na řádek otevřete kartu stroje.`}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button asChild size="dotyk" variant="outline">
            <Link href="/zarizeni/typy">
              <Cog aria-hidden="true" className="h-4 w-4" />
              Typy zařízení
            </Link>
          </Button>
          {smiSpravovat ? (
            <Button asChild size="dotyk">
              <Link href="/zarizeni/nove">
                <Plus aria-hidden="true" className="h-4 w-4" />
                Nové zařízení
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      {/* Prázdný formulář mimo tabulku - políčka v hlavičce se k němu hlásí
          atributem `form`. Drží i volbu oblasti z přepínače v hlavičce, o kterou
          bychom odesláním filtru jinak přišli. */}
      <form id={ID_FILTRU} method="get" className="hidden">
        {kodOblasti ? <input type="hidden" name="oblast" value={kodOblasti} /> : null}
      </form>

      {/* `overflow-hidden` kvůli podbarvené hlavičce - bez něj by přetekla
          přes zaoblené rohy karty. */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <HlavickaTabulkyZarizeni
              idFormulare={ID_FILTRU}
              hodnoty={{
                oblast: kodOblasti,
                nazev: hledanyNazev,
                inv: hledaneCislo,
                typ: kodTypu,
                umisteni: kodUmisteni,
                stav,
              }}
              typy={ciselniky.typy.map((t) => ({ id: t.id, kod: t.kod, nazev: t.nazev }))}
              haly={ciselniky.umisteni.haly}
              stavy={STAVY_ZARIZENI}
              smiSpravovat={smiSpravovat}
              jeFiltrovano={jeFiltrovano}
            />
            <tbody>
              {zarizeni.length === 0 ? (
                // Tabulka zůstává i bez výsledků - kdyby zmizela, zmizel by
                // s ní filtr v hlavičce a nebylo by ho jak vrátit zpátky.
                <tr>
                  <td colSpan={pocetSloupcu} className="px-4 py-12 text-center">
                    <PackageSearch
                      aria-hidden="true"
                      className="mx-auto mb-4 h-10 w-10 text-zvyrazneni/40"
                    />
                    <p className="font-medium">
                      {jeFiltrovano
                        ? 'Filtru neodpovídá žádné zařízení.'
                        : 'Zatím tu není žádné zařízení.'}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {jeFiltrovano
                        ? 'Zkuste zadání zkrátit nebo filtr zrušte křížkem vpravo nahoře.'
                        : smiSpravovat
                          ? 'Založte první stroj tlačítkem nahoře.'
                          : 'Evidenci plní garant vaší oblasti.'}
                    </p>
                  </td>
                </tr>
              ) : (
                zarizeni.map((z) => (
                  // Klikací je celý řádek, ne jen název: odkaz na kartu roztahuje
                  // svoje ::after přes celou buňkovou řadu (proto `relative` na
                  // řádku). Pro obsluhu v rukavicích je to podstatně větší cíl
                  // než dvouslovný název stroje.
                  <tr
                    key={z.id}
                    className="group relative cursor-pointer border-b transition-colors last:border-0 focus-within:bg-accent hover:bg-accent"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/zarizeni/${z.id}`}
                        className="rounded-sm font-medium underline-offset-4 after:absolute after:inset-0 hover:underline focus-visible:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
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
                    {/* Typ je kategorie, ne volný text - štítek zvládne oko
                        seskupit rychleji než holé slovo v řádku. */}
                    <td className="px-4 py-3">
                      {z.typ?.nazev ? (
                        <span className="inline-flex whitespace-nowrap rounded-md bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground">
                          {z.typ.nazev}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {z.umisteni ? (
                        <span className="inline-flex items-center gap-1.5">
                          <MapPin
                            aria-hidden="true"
                            className="h-3.5 w-3.5 shrink-0 text-zvyrazneni"
                          />
                          {cestaUmisteni(z.umisteni)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <ZnackaStavu stav={z.stav} />
                    </td>
                    {smiSpravovat ? (
                      // `relative z-10` vytahuje tlačítko nad roztažený odkaz na
                      // kartu - jinak by ho překryl a Upravit by nešlo kliknout.
                      <td className="relative z-10 px-4 py-3 text-right">
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/zarizeni/${z.id}/upravit`}>
                            Upravit
                            {/* Bez názvu stroje by odečítač obrazovky přečetl
                                jen řadu stejných „Upravit". */}
                            <span className="sr-only"> {z.nazev}</span>
                          </Link>
                        </Button>
                      </td>
                    ) : null}
                    {/* Šipka je jen vizuální pobídka „tady se dá kliknout" -
                        odkaz nese název stroje, takže pro odečítač je navíc. */}
                    <td className="px-4 py-3 text-muted-foreground">
                      <ChevronRight
                        aria-hidden="true"
                        className="ml-auto h-5 w-5 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
                      />
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
