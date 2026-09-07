import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CircleAlert, Plus, TriangleAlert } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { TlacitkoSmazat } from '@/components/ui/tlacitko-smazat'
import {
  PrejmenovatOblast,
  PridatOblast,
  PrepnoutAktivituOblasti,
} from '@/components/oblasti/formulare-oblasti'
import { maPravo } from '@/lib/auth/opravneni'
import { nactiPrihlaseneho } from '@/lib/auth/session'
import { nactiOblasti, type Oblast } from '@/lib/oblasti/dotazy'
import { duvodNelzeSmazat, maAktivnihoGaranta, type ClovekVOblasti } from '@/lib/oblasti/oblast'
import { pridejOblast, prejmenujOblast, prepniAktivituOblasti, smazOblast } from './actions'

export const metadata = { title: 'Oblasti a garanti' }

/**
 * Číselník oblastí údržby a přehled, kdo je drží (modul M6).
 *
 * Oblasti i vazba na osoby existují od migrace 0001, chyběla jen obrazovka -
 * proto tenhle modul žádnou migraci nepotřebuje, stejně jako auditní log.
 *
 * Přiřazovat lidi k oblasti se chodí na kartu osoby, tady se jen zobrazují.
 * Je to schválně: jedno místo pravdy, žádná dvojí cesta k témuž. Navíc do
 * `uzivatel_oblast` smí podle politiky z 0001 zapisovat jen administrátor,
 * kdežto číselník smí měnit i vedoucí údržby - obrazovka by pak musela mít
 * na jednom místě dvě různé úrovně práv.
 */
export default async function StrankaOblasti() {
  const uzivatel = await nactiPrihlaseneho()
  if (!uzivatel) redirect('/login')

  const oblasti = await nactiOblasti()
  const smiSpravovat = maPravo(uzivatel.role, 'ciselniky', 'zapis')
  // Karty osob vidí jen administrátor, vedoucí údržby ne. Komu tam cesta není,
  // ten dostane jména jako text - odkaz by ho poslal do zdi.
  const smiNaKartyOsob = maPravo(uzivatel.role, 'uzivatele', 'cteni')

  const aktivni = oblasti.filter((o) => o.aktivni)
  const vyrazene = oblasti.filter((o) => !o.aktivni)
  const bezGaranta = aktivni.filter((o) => !maAktivnihoGaranta(o.lide)).length

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Oblasti a garanti</h1>
        <p className="text-muted-foreground">
          Jak je podnik rozdělený a kdo za co odpovídá. Na oblast se váže zařízení, šablona i zápis
          v deníku a podle ní se rozhoduje, kdo kam smí. Zařazení lidí se mění na kartě osoby{' '}
          {smiNaKartyOsob ? (
            <>
              v{' '}
              <Link href="/nastaveni/uzivatele" className="underline underline-offset-2">
                Uživatelích a rolích
              </Link>
              .
            </>
          ) : (
            <>— tu spravuje administrátor.</>
          )}
        </p>
      </div>

      {bezGaranta > 0 ? (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="flex gap-3 py-4 text-sm">
            <TriangleAlert className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden="true" />
            <span>
              <strong className="font-medium">{popisDeru(bezGaranta)}</strong> Restance z ní nemá
              komu chodit a zařízení v ní nikdo nespravuje. Garanta přidáte tak, že osobě na její
              kartě nastavíte u oblasti vztah „garant“.
            </span>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">V nabídce</CardTitle>
          <CardDescription>
            {aktivni.length === 0
              ? 'Číselník je prázdný — bez oblasti nejde založit zařízení ani šablona.'
              : 'Tyhle oblasti se nabízejí při zakládání zařízení, šablon a při zařazení osob.'}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {aktivni.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">
              {smiSpravovat
                ? 'Doplňte první oblast formulářem níž.'
                : 'Číselník plní administrátor a vedoucí údržby.'}
            </p>
          ) : (
            <ul className="divide-y rounded-md border">
              {aktivni.map((oblast) => (
                <RadekOblasti
                  key={oblast.id}
                  oblast={oblast}
                  smiSpravovat={smiSpravovat}
                  smiNaKartyOsob={smiNaKartyOsob}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {vyrazene.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Vyřazené</CardTitle>
            <CardDescription>
              Nenabízejí se při zakládání, ale zařízení a šablony v nich o zařazení nepřišly.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <ul className="divide-y rounded-md border">
              {vyrazene.map((oblast) => (
                <RadekOblasti
                  key={oblast.id}
                  oblast={oblast}
                  smiSpravovat={smiSpravovat}
                  smiNaKartyOsob={smiNaKartyOsob}
                  vyrazena
                />
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {smiSpravovat ? (
        <Card className="border-primary/40">
          <CardHeader className="rounded-t-lg border-b border-primary/30 bg-primary/5">
            <CardTitle className="flex items-center gap-2 text-base">
              <Plus className="size-4 text-primary" aria-hidden="true" />
              Nová oblast
            </CardTitle>
            <CardDescription>
              Kód se odvodí z názvu a už se nemění — páruje se přes něj seed i případný import.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <PridatOblast akce={pridejOblast} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

function popisDeru(pocet: number): string {
  if (pocet === 1) return 'Jedna oblast nemá garanta.'
  if (pocet < 5) return `${pocet} oblasti nemají garanta.`

  return `${pocet} oblastí nemá garanta.`
}

function RadekOblasti({
  oblast,
  smiSpravovat,
  smiNaKartyOsob,
  vyrazena = false,
}: {
  oblast: Oblast
  smiSpravovat: boolean
  smiNaKartyOsob: boolean
  vyrazena?: boolean
}) {
  const duvod = duvodNelzeSmazat(oblast.pocty)
  const garanti = oblast.lide.filter((c) => c.vztah === 'garant')
  const spolupracujici = oblast.lide.filter((c) => c.vztah === 'spolupracujici')

  return (
    <li className="flex flex-wrap items-start gap-3 px-3 py-3">
      <div className="min-w-0 flex-1 space-y-2">
        {smiSpravovat && !vyrazena ? (
          <PrejmenovatOblast akce={prejmenujOblast.bind(null, oblast.id)} nazev={oblast.nazev} />
        ) : (
          <span className={vyrazena ? 'font-medium text-muted-foreground' : 'font-medium'}>
            {oblast.nazev}
          </span>
        )}

        <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="stitek-razeny">{oblast.kod}</span>
          <span>{duvod ?? 'zatím bez zařízení i šablon'}</span>
        </p>

        <div className="space-y-1">
          <Osazenstvo
            popisek="Garant"
            lide={garanti}
            smiNaKartyOsob={smiNaKartyOsob}
            // U vyřazené oblasti chybějící garant nic neznamená - nikdo v ní nepracuje.
            chybejici={vyrazena ? null : 'bez garanta'}
          />
          <Osazenstvo
            popisek="Spolupracující"
            lide={spolupracujici}
            smiNaKartyOsob={smiNaKartyOsob}
            chybejici={null}
          />
        </div>
      </div>

      {smiSpravovat ? (
        <div className="flex flex-wrap items-center gap-2">
          <PrepnoutAktivituOblasti
            akce={prepniAktivituOblasti.bind(null, oblast.id, vyrazena)}
            aktivni={!vyrazena}
            nazev={oblast.nazev}
          />
          <MazaciTlacitko id={oblast.id} nazev={oblast.nazev} duvod={duvod} />
        </div>
      ) : null}
    </li>
  )
}

/**
 * Jména lidí v oblasti. Vyřazená osoba zůstává vidět, ale je u ní napsáno proč -
 * jinak by se seznam tvářil, že oblast někdo drží, i když ten člověk skončil.
 */
function Osazenstvo({
  popisek,
  lide,
  smiNaKartyOsob,
  chybejici,
}: {
  popisek: string
  lide: ClovekVOblasti[]
  smiNaKartyOsob: boolean
  chybejici: string | null
}) {
  if (lide.length === 0) {
    if (!chybejici) return null

    return (
      <p className="flex items-center gap-1.5 text-sm font-medium text-destructive">
        <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
        {chybejici}
      </p>
    )
  }

  return (
    <p className="text-sm">
      <span className="text-muted-foreground">{popisek}: </span>
      {lide.map((clovek, poradi) => (
        <span key={clovek.id}>
          {poradi > 0 ? ', ' : null}
          <JmenoOsoby clovek={clovek} smiNaKartyOsob={smiNaKartyOsob} />
        </span>
      ))}
    </p>
  )
}

function JmenoOsoby({
  clovek,
  smiNaKartyOsob,
}: {
  clovek: ClovekVOblasti
  smiNaKartyOsob: boolean
}) {
  const jmeno = clovek.aktivni ? (
    <>{clovek.celeJmeno}</>
  ) : (
    <span className="text-muted-foreground">{clovek.celeJmeno} (vyřazená osoba)</span>
  )

  if (!smiNaKartyOsob) return jmeno

  return (
    <Link href={`/nastaveni/uzivatele/${clovek.id}`} className="underline underline-offset-2">
      {jmeno}
    </Link>
  )
}

/**
 * Mazat jde jen oblast, na které nic nevisí - drží ji cizí klíče s `on delete
 * restrict`. Tlačítko, které vždycky skončí chybou, je horší než žádné, takže
 * na jeho místě stojí červený štítek s důvodem. Stejně jako u druhů zásahu.
 */
function MazaciTlacitko({ id, nazev, duvod }: { id: string; nazev: string; duvod: string | null }) {
  if (duvod) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive">
        <CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />
        nelze smazat — {duvod}
      </span>
    )
  }

  return (
    <TlacitkoSmazat
      akce={smazOblast.bind(null, id)}
      nazev={nazev}
      otazka={`Opravdu smazat oblast „${nazev}“?`}
    />
  )
}
