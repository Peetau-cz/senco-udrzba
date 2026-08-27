import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { CircleCheck, Image as IkonaFotky, Lock, NotebookPen, PencilLine } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FormularZasahu } from '@/components/denik/formular-zasahu'
import { FotkyZasahu } from '@/components/denik/fotky-zasahu'
import { OdkazZpet } from '@/components/layout/odkaz-zpet'
import { nactiPrihlaseneho } from '@/lib/auth/session'
import { formatDatumCas } from '@/lib/datum'
import {
  nactiDruhyZasahu,
  nactiLidi,
  nactiNabidkuZarizeni,
  nactiZapis,
} from '@/lib/denik/dotazy'
import { formatDobu, nyniProFormular } from '@/lib/denik/zasah'
import { pridejFotkuZasahu, smazFotkuZasahu, upravZasah } from '../actions'

export const metadata = { title: 'Zápis v deníku' }

type Parametry = Record<string, string | string[] | undefined>

function jmenoOsoby(osoba: { jmeno: string; prijmeni: string } | null): string {
  if (!osoba) return '—'
  return `${osoba.jmeno} ${osoba.prijmeni}`.trim() || '—'
}

/** Pražský čas ve tvaru pro `datetime-local`, aby se formulář otevřel s tím, co je uložené. */
function proFormular(iso: string): string {
  return nyniProFormular(new Date(iso))
}

/**
 * Detail zápisu v provozním deníku.
 *
 * Jestli jde zápis ještě opravit, neurčuje tahle stránka počítáním hodin -
 * odpovídá funkce muze_menit_zapis_deniku z migrace 0022, tedy stejná autorita,
 * na které stojí trigger nad tabulkou i politiky nad úložištěm. Rozhraní jen
 * ukáže nebo neukáže formulář.
 */
export default async function StrankaZapisu({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Parametry>
}) {
  const uzivatel = await nactiPrihlaseneho()
  if (!uzivatel) redirect('/login')

  const { id } = await params
  const zapis = await nactiZapis(id)

  // Cizí oblast RLS odfiltruje a dotaz nevrátí nic. Pro uživatele je to totéž
  // jako neexistující zápis - a je to tak správně, existenci neprozrazujeme.
  if (!zapis) notFound()

  const parametry = await searchParams
  const ulozeno = typeof parametry.ulozeno === 'string'

  const [stroje, druhy, lide] = zapis.smiMenit
    ? await Promise.all([nactiNabidkuZarizeni(), nactiDruhyZasahu(true), nactiLidi()])
    : [[], [], []]

  return (
    <div className="max-w-3xl space-y-6">
      <OdkazZpet href="/denik" popisek="Zpět na provozní deník" />

      <div>
        <h1 className="text-2xl font-semibold">{zapis.druh?.nazev ?? 'Zásah'}</h1>
        <p className="text-muted-foreground">
          {zapis.stroj ? (
            <Link
              href={`/zarizeni/${zapis.zarizeni_id}`}
              className="underline underline-offset-4"
            >
              {zapis.stroj.nazev}
            </Link>
          ) : (
            'Stroj se nepodařilo načíst'
          )}
          {' · '}
          {formatDatumCas(zapis.provedeno_at)}
        </p>
      </div>

      {ulozeno ? (
        <Card className="border-l-4 border-l-stav-splneno">
          <CardContent className="flex gap-3 py-4 text-sm">
            <CircleCheck className="mt-0.5 size-5 shrink-0 text-stav-splneno" aria-hidden="true" />
            <span>Oprava je uložená. Původní znění zůstává v auditu.</span>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <NotebookPen aria-hidden="true" className="h-4 w-4 text-zvyrazneni" />
            Co se dělo
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="whitespace-pre-line">{zapis.popis}</p>

          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            <Udaj popisek="Provedl" hodnota={jmenoOsoby(zapis.provedl)} />
            <Udaj popisek="Zapsal" hodnota={jmenoOsoby(zapis.zapsal)} />
            <Udaj popisek="Doba trvání" hodnota={formatDobu(zapis.doba_trvani_min)} />
            <Udaj popisek="Zapsáno" hodnota={formatDatumCas(zapis.vytvoreno_at)} />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <IkonaFotky aria-hidden="true" className="h-4 w-4 text-zvyrazneni" />
            Fotky
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FotkyZasahu
            fotky={zapis.fotky}
            smiMenit={zapis.smiMenit}
            nahrajAkce={pridejFotkuZasahu.bind(null, zapis.id)}
            smazAkce={smazFotkuZasahu.bind(null, zapis.id)}
          />
        </CardContent>
      </Card>

      {zapis.smiMenit ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <PencilLine aria-hidden="true" className="h-4 w-4 text-zvyrazneni" />
              Oprava zápisu
            </CardTitle>
            <CardDescription>
              Opravit jde i stroj a datum — nejčastější chyba je vybraná špatná mašina. Smazat
              zápis nelze a každá změna se ukládá do auditu.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FormularZasahu
              akce={upravZasah.bind(null, zapis.id)}
              stroje={stroje}
              druhy={druhy}
              lide={lide}
              vychoziZarizeniId={zapis.zarizeni_id}
              vychoziDruhId={zapis.druh?.id ?? ''}
              vychoziPopis={zapis.popis}
              vychoziCas={proFormular(zapis.provedeno_at)}
              vychoziProvedlId={zapis.provedl?.id ?? ''}
              vychoziDoba={zapis.doba_trvani_min?.toString() ?? ''}
              popisekAkce="Uložit opravu"
              nabidnoutFotku={false}
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex gap-3 py-6 text-sm text-muted-foreground">
            <Lock className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
            <span>
              Zápis už opravit nejde. Autor na to má 24 hodin od zapsání, potom už jen vedoucí
              údržby nebo administrátor — historie, kterou lze kdykoli přepsat, nemá důkazní
              hodnotu.
            </span>
          </CardContent>
        </Card>
      )}
    </div>
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
