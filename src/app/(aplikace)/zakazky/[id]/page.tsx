import Link from 'next/link'
import { CalendarClock, Hash, Layers, Users } from 'lucide-react'
import { notFound, redirect } from 'next/navigation'
import { OdkazZpet } from '@/components/layout/odkaz-zpet'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { KrokChecklistu } from '@/components/plan/krok-checklistu'
import { ZnackaTerminu } from '@/components/plan/znacka-terminu'
import { PatickaZakazky } from '@/components/plan/paticka-zakazky'
import { maPravo } from '@/lib/auth/opravneni'
import { nactiPrihlaseneho } from '@/lib/auth/session'
import { formatDatum, formatDatumCas } from '@/lib/datum'
import { celeJmeno, jeOtevrena, nactiKrokyZakazky, nactiZakazku } from '@/lib/plan/dotazy'
import { dnesVPraze, procentoHotovo } from '@/lib/plan/terminy'
import {
  dokonciZakazku,
  nahrajFotku,
  prevezmiZakazku,
  smazFotku,
  ulozKrok,
  zahajZakazku,
} from './actions'

type Parametry = Record<string, string | string[] | undefined>

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const zakazka = await nactiZakazku(id)

  return { title: zakazka?.zarizeni?.nazev ?? 'Provedení údržby' }
}

/**
 * Provedení údržby — checklist podle wireframu v docs/NAVRH.md kap. 5.3.
 *
 * Optimalizované pro tablet: velké dotykové cíle, jeden rozbalený krok, žádné
 * zanořené formuláře. Naplňuje požadavek „celý proces musí být co nejjednodušší"
 * (zadání ř. 132).
 *
 * Který krok je otevřený, drží adresa (`?krok=`), ne stav v prohlížeči. Odeslání
 * formuláře tak nezavře, co technik rozdělal, a odkaz na konkrétní krok jde
 * poslat kolegovi.
 */
export default async function StrankaZakazky({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Parametry>
}) {
  const uzivatel = await nactiPrihlaseneho()
  if (!uzivatel) redirect('/login')

  const { id } = await params
  const zakazka = await nactiZakazku(id)

  // Cizí oblast RLS odfiltruje a dotaz nevrátí nic. Pro uživatele je to totéž
  // jako neexistující zakázka - a je to tak správně, existenci neprozrazujeme.
  if (!zakazka) notFound()

  const kroky = await nactiKrokyZakazky(zakazka.id)
  const parametry = await searchParams

  const otevrena = jeOtevrena(zakazka)
  const smiZapisovat = maPravo(uzivatel.role, 'provedeni', 'zapis')
  const dnes = dnesVPraze()

  const hotovo = kroky.filter((k) => k.stav !== 'nesplneno').length
  const zbyva = kroky.length - hotovo

  // Otevřený krok: buď ten z adresy, nebo první nevyřízený. U uzavřené zakázky
  // se nerozbaluje nic - není co vyplňovat a souhrny se čtou líp pod sebou.
  const zadany = typeof parametry.krok === 'string' ? parametry.krok : undefined
  const otevrenyKrok = otevrena
    ? (kroky.find((k) => k.id === zadany)?.id ??
      (zadany ? undefined : kroky.find((k) => k.stav === 'nesplneno')?.id))
    : undefined

  const mam = zakazka.prirazeno?.id === uzivatel.id

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <OdkazZpet href="/plan" popisek="Plán údržby" />
          <h1 className="text-2xl font-semibold">
            {zakazka.zarizeni?.nazev ?? 'neznámé zařízení'}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <Stitek ikona={Hash} cislice>
              {zakazka.zarizeni?.inventarni_cislo ?? 'bez inv. čísla'}
            </Stitek>
            <Stitek ikona={Users}>{zakazka.profese?.nazev ?? 'bez profese'}</Stitek>
            <Stitek ikona={Layers} cislice>
              {zakazka.verze?.sablona?.nazev ?? 'šablona'} · v{zakazka.verze?.cislo_verze ?? '?'}
            </Stitek>
            <Stitek ikona={CalendarClock} cislice>
              plán {formatDatum(zakazka.planovany_termin)}
            </Stitek>
            {otevrena ? <ZnackaTerminu termin={zakazka.planovany_termin} dnes={dnes} /> : null}
          </div>
        </div>

        {zakazka.zarizeni ? (
          <Button asChild size="dotyk" variant="outline">
            <Link href={`/zarizeni/${zakazka.zarizeni.id}`}>Karta zařízení</Link>
          </Button>
        ) : null}
      </div>

      {zakazka.stav === 'dokonceno' ? (
        <Card className="border-l-4 border-l-stav-splneno">
          <CardContent className="pt-6 text-sm">
            <p className="font-medium">
              Údržba dokončena {formatDatumCas(zakazka.dokonceno_at)}
              {celeJmeno(zakazka.dokoncil) ? ` — ${celeJmeno(zakazka.dokoncil)}` : ''}.
            </p>
            <p className="mt-1 text-muted-foreground">
              Hotová zakázka je neměnná. Kdyby se něco ukázalo dodatečně, patří to do provozního
              deníku — přepsat historii by znamenalo připravit ji o důkazní hodnotu.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {zakazka.stav === 'zruseno' ? (
        <Card className="border-l-4 border-l-muted">
          <CardContent className="pt-6 text-sm">
            <p className="font-medium">Zakázka byla zrušena.</p>
            {zakazka.poznamka ? (
              <p className="mt-1 whitespace-pre-line text-muted-foreground">{zakazka.poznamka}</p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b bg-secondary/40 px-4 py-3">
          <div>
            <p className="text-sm font-medium">Postup</p>
            <p className="cislice-tabulkove text-sm text-muted-foreground">
              {hotovo} z {kroky.length} hotovo
              {zbyva > 0 && otevrena ? ` · zbývá ${zbyva}` : ''}
            </p>
          </div>

          <div
            role="progressbar"
            aria-valuenow={procentoHotovo(hotovo, kroky.length)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Hotové kroky"
            className="h-2 w-full max-w-sm overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full rounded-full bg-stav-splneno transition-all"
              style={{ width: `${procentoHotovo(hotovo, kroky.length)}%` }}
            />
          </div>
        </div>

        {kroky.length === 0 ? (
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Zakázka nemá jediný krok. To by nemělo nastat — plánovač zakládá zakázku vždy
            i s úkony.
          </CardContent>
        ) : (
          <ul>
            {kroky.map((krok) => (
              <KrokChecklistu
                key={krok.id}
                krok={krok}
                otevreny={krok.id === otevrenyKrok}
                hotovaZakazka={!otevrena}
                smiZapisovat={smiZapisovat}
                odkazOtevrit={`/zakazky/${zakazka.id}?krok=${krok.id}`}
                ulozAkce={ulozKrok.bind(null, zakazka.id, krok.id)}
                fotkaAkce={nahrajFotku.bind(null, zakazka.id, krok.id)}
                smazFotkuAkce={smazFotku.bind(null, zakazka.id)}
              />
            ))}
          </ul>
        )}
      </Card>

      {otevrena && smiZapisovat ? (
        <PatickaZakazky
          zbyva={zbyva}
          zahajena={zakazka.stav === 'probiha'}
          mam={mam}
          zahajAkce={zahajZakazku.bind(null, zakazka.id)}
          prevezmiAkce={prevezmiZakazku.bind(null, zakazka.id, !mam)}
          dokonciAkce={dokonciZakazku.bind(null, zakazka.id)}
        />
      ) : null}
    </div>
  )
}

function Stitek({
  ikona: Ikona,
  cislice = false,
  children,
}: {
  ikona: typeof Hash
  cislice?: boolean
  children: React.ReactNode
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
