import type { ReactNode } from 'react'
import Link from 'next/link'
import { CalendarClock, Hash, Layers, Pencil, Users } from 'lucide-react'
import { notFound, redirect } from 'next/navigation'
import { OdkazZpet } from '@/components/layout/odkaz-zpet'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FormularSPotvrzenim } from '@/components/ui/potvrzeni'
import { EditorMatice } from '@/components/sablony/editor-matice'
import { NahledMatice } from '@/components/sablony/nahled-matice'
import { ZnackaVerze } from '@/components/sablony/znacka-verze'
import { ZnackaStavu } from '@/components/zarizeni/znacka-stavu'
import { maPravo } from '@/lib/auth/opravneni'
import { nactiPrihlaseneho } from '@/lib/auth/session'
import { formatDatumCas } from '@/lib/datum'
import { prectiBody } from '@/lib/sablony/kontrolni-body'
import {
  aktivniVerze,
  nactiPrirazenaZarizeni,
  nactiProfese,
  nactiSablonu,
  nactiUkony,
  nactiVerze,
  nactiZarizeniProPrirazeni,
  navrhVerze,
  pocetUkonu,
} from '@/lib/sablony/dotazy'
import {
  aktivujVerzi,
  odeberZarizeni,
  prirazZarizeni,
  ulozMatici,
  zahodNavrh,
  zalozNavrh,
} from '../actions'

const ZALOZKY = [
  { klic: 'matice', popisek: 'Matice úkonů' },
  { klic: 'verze', popisek: 'Verze' },
  { klic: 'zarizeni', popisek: 'Zařízení' },
] as const

type KlicZalozky = (typeof ZALOZKY)[number]['klic']

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const sablona = await nactiSablonu(id)

  return { title: sablona?.nazev ?? 'Šablona' }
}

/**
 * Detail šablony údržby (modul M2).
 *
 * Záložky jsou obyčejné odkazy s parametrem v adrese, stejně jako na kartě
 * zařízení - konkrétní pohled tak jde poslat kolegovi odkazem.
 *
 * Matice se needituje přímo. Kdo chce změnit obsah, založí návrh nové verze;
 * aktivovaná verze je neměnná, jinak by úprava zpětně přepsala, co technik
 * odškrtal (rozhodnutí R3, NAVRH.md kap. 2.3).
 */
export default async function DetailSablony({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const uzivatel = await nactiPrihlaseneho()
  if (!uzivatel) redirect('/login')

  const { id } = await params
  const sablona = await nactiSablonu(id)
  if (!sablona) notFound()

  const parametryAdresy = await searchParams
  const pozadovana = parametryAdresy.zalozka
  const zalozka: KlicZalozky = ZALOZKY.some((z) => z.klic === pozadovana)
    ? (pozadovana as KlicZalozky)
    : 'matice'

  const smiSpravovat = maPravo(uzivatel.role, 'sablony', 'zapis')
  const verze = await nactiVerze(sablona.id)
  const platna = aktivniVerze(verze)
  const navrh = navrhVerze(verze)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <OdkazZpet href="/sablony" popisek="Šablony" />
          <h1 className="text-2xl font-semibold">{sablona.nazev}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <Stitek ikona={Hash} cislice>
              {sablona.kod}
            </Stitek>
            <Stitek ikona={Users}>{sablona.oblast?.nazev ?? 'bez oblasti'}</Stitek>
            {platna ? (
              <Stitek ikona={Layers} cislice>
                verze {platna.cislo_verze}
              </Stitek>
            ) : (
              <Stitek ikona={Layers}>zatím bez platné verze</Stitek>
            )}
            {!sablona.aktivni ? (
              <span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                nenabízí se
              </span>
            ) : null}
          </div>
          {sablona.popis ? (
            <p className="max-w-2xl pt-1 text-sm text-muted-foreground">{sablona.popis}</p>
          ) : null}
        </div>

        {/* Hlavní akce na detailu šablony je změna obsahu matice, ne přejmenování.
            Matice se ale needituje přímo (R3), takže tlačítko za uživatele otevře
            novou verzi - založení návrhu je v databázi idempotentní, takže
            opakovaný klik nezaloží druhý. Údaje šablony zůstávají vedle, potichu. */}
        {smiSpravovat ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild size="dotyk" variant="outline">
              <Link href={`/sablony/${sablona.id}/upravit`}>
                <Pencil aria-hidden="true" className="size-4" />
                Upravit údaje
              </Link>
            </Button>

            {navrh ? (
              <Button asChild size="dotyk">
                <Link href={`/sablony/${sablona.id}?zalozka=matice`}>
                  <Layers aria-hidden="true" className="size-4" />
                  Pokračovat v návrhu v{navrh.cislo_verze}
                </Link>
              </Button>
            ) : (
              <FormularSPotvrzenim
                akce={zalozNavrh.bind(null, sablona.id)}
                otazka="Otevřít novou verzi matice?"
                popis={
                  platna
                    ? `Zkopíruje se verze ${platna.cislo_verze} a otevře se k úpravám. Strojům platí dál verze ${platna.cislo_verze}, dokud novou neaktivujete.`
                    : 'Šablona zatím nemá žádnou verzi — otevře se prázdná matice.'
                }
                potvrdit={`Otevřít verzi ${(verze[0]?.cislo_verze ?? 0) + 1}`}
              >
                <Button type="submit" size="dotyk">
                  <Layers aria-hidden="true" className="size-4" />
                  Upravit matici
                </Button>
              </FormularSPotvrzenim>
            )}
          </div>
        ) : null}
      </div>

      <nav className="flex flex-wrap gap-1 border-b" aria-label="Části šablony">
        {ZALOZKY.map((z) => {
          const jeAktivni = z.klic === zalozka
          return (
            <Link
              key={z.klic}
              href={`/sablony/${sablona.id}?zalozka=${z.klic}`}
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

      {zalozka === 'matice' ? (
        <ZalozkaMatice
          sablonaId={sablona.id}
          platnaId={platna?.id ?? null}
          platnaCislo={platna?.cislo_verze ?? null}
          navrhId={navrh?.id ?? null}
          navrhCislo={navrh?.cislo_verze ?? null}
          smiSpravovat={smiSpravovat}
          zvolenaVerze={
            typeof parametryAdresy.verze === 'string' ? parametryAdresy.verze : undefined
          }
          verze={verze}
        />
      ) : null}

      {zalozka === 'verze' ? (
        <ZalozkaVerze sablonaId={sablona.id} verze={verze} smiSpravovat={smiSpravovat} />
      ) : null}

      {zalozka === 'zarizeni' ? (
        <ZalozkaZarizeni
          sablonaId={sablona.id}
          oblastId={sablona.oblast_id}
          maPlatnouVerzi={Boolean(platna)}
          smiSpravovat={smiSpravovat}
        />
      ) : null}
    </div>
  )
}

// -----------------------------------------------------------------------------
// Matice
// -----------------------------------------------------------------------------

async function ZalozkaMatice({
  sablonaId,
  platnaId,
  platnaCislo,
  navrhId,
  navrhCislo,
  smiSpravovat,
  zvolenaVerze,
  verze,
}: {
  sablonaId: string
  platnaId: string | null
  platnaCislo: number | null
  navrhId: string | null
  navrhCislo: number | null
  smiSpravovat: boolean
  zvolenaVerze?: string
  verze: { id: string; cislo_verze: number; stav: string }[]
}) {
  // Rozdělaný návrh má přednost: když existuje, je to to, na čem se pracuje.
  // Konkrétní verzi lze vynutit parametrem v adrese (odkaz ze záložky Verze).
  const prohlizena = zvolenaVerze && verze.some((v) => v.id === zvolenaVerze) ? zvolenaVerze : null

  if (!prohlizena && smiSpravovat && navrhId) {
    const [ukony, profese] = await Promise.all([nactiUkony(navrhId), nactiProfese()])

    return (
      <div className="space-y-4">
        <div className="rounded-md border border-stav-dnes/40 bg-stav-dnes/5 p-4 text-sm">
          <p className="font-medium">
            Upravujete návrh verze {navrhCislo}
            {platnaCislo ? ` — dokud ho neaktivujete, strojům platí verze ${platnaCislo}` : ''}.
          </p>
          <p className="mt-1 text-muted-foreground">
            Aktivace je v záložce Verze. Aktivovanou verzi už změnit nepůjde — právě tím zůstane
            historie provedených údržeb platná.
          </p>
        </div>

        <EditorMatice
          akce={ulozMatici.bind(null, sablonaId, navrhId)}
          profese={profese}
          ukony={ukony.map((u) => ({
            klic: u.klic,
            nazev: u.nazev,
            popis: u.popis ?? '',
            interval_typ: u.interval_typ,
            interval_hodnota: String(u.interval_hodnota),
            interval_zaklad: u.interval_zaklad,
            tolerance_dny: String(u.tolerance_dny),
            profese_role_id: u.profese?.id ?? '',
            kontrolni_body: prectiBody(u.kontrolni_body),
            vyzaduje_foto: u.vyzaduje_foto,
            vyzaduje_hodnotu: u.vyzaduje_hodnotu,
            nabizi_poznamku: u.nabizi_poznamku,
            jednotka: u.jednotka ?? '',
            mez_min: u.mez_min === null ? '' : String(u.mez_min),
            mez_max: u.mez_max === null ? '' : String(u.mez_max),
          }))}
        />
      </div>
    )
  }

  const zobrazena = prohlizena ?? platnaId

  if (!zobrazena) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <Layers aria-hidden="true" className="mx-auto mb-4 h-10 w-10 text-zvyrazneni/40" />
          <p className="font-medium">Šablona zatím nemá žádnou matici.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {smiSpravovat
              ? 'Otevřete ji tlačítkem „Upravit matici" vpravo nahoře a doplňte úkony.'
              : 'Matici sestavuje garant oblasti.'}
          </p>
        </CardContent>
      </Card>
    )
  }

  const ukony = await nactiUkony(zobrazena)
  const cislo = verze.find((v) => v.id === zobrazena)?.cislo_verze
  const stav = verze.find((v) => v.id === zobrazena)?.stav ?? 'aktivni'

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Layers aria-hidden="true" className="h-4 w-4 text-zvyrazneni" />
            Matice úkonů · verze {cislo}
          </CardTitle>
          <CardDescription>
            {stav === 'aktivni'
              ? 'Tohle právě platí pro všechny přiřazené stroje.'
              : 'Archivovaná verze. Zůstává, protože se na ni odkazují provedené údržby.'}
          </CardDescription>
        </div>
        <ZnackaVerze stav={stav} />
      </CardHeader>
      <CardContent>
        <NahledMatice ukony={ukony} />
      </CardContent>
    </Card>
  )
}

// -----------------------------------------------------------------------------
// Verze
// -----------------------------------------------------------------------------

/**
 * Přehled verzí.
 *
 * Novou verzi tudy zakládat nejde schválně - je to hlavní akce šablony a sedí
 * v hlavičce, viditelná ze všech záložek. Dvě tlačítka na jednu věc na jedné
 * obrazovce jsou horší než jedno na správném místě.
 */
async function ZalozkaVerze({
  sablonaId,
  verze,
  smiSpravovat,
}: {
  sablonaId: string
  verze: Awaited<ReturnType<typeof nactiVerze>>
  smiSpravovat: boolean
}) {
  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Verze</th>
                <th className="px-4 py-3 font-medium">Stav</th>
                <th className="px-4 py-3 font-medium">Úkonů</th>
                <th className="px-4 py-3 font-medium">Platí od</th>
                <th className="px-4 py-3 font-medium">Založil</th>
                <th className="px-4 py-3 text-right font-medium">
                  <span className="sr-only">Akce</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {verze.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    Šablona zatím nemá žádnou verzi.
                  </td>
                </tr>
              ) : (
                verze.map((v) => (
                  <tr key={v.id} className="border-b last:border-0">
                    <td className="cislice-tabulkove px-4 py-3 font-medium">{v.cislo_verze}</td>
                    <td className="px-4 py-3">
                      <ZnackaVerze stav={v.stav} />
                    </td>
                    <td className="cislice-tabulkove px-4 py-3">{pocetUkonu(v)}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {v.platna_od ? formatDatumCas(v.platna_od) : '—'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {celeJmeno(v.vytvoril) || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button asChild variant="ghost" size="sm">
                          <Link href={`/sablony/${sablonaId}?zalozka=matice&verze=${v.id}`}>
                            Zobrazit matici
                            <span className="sr-only"> verze {v.cislo_verze}</span>
                          </Link>
                        </Button>

                        {smiSpravovat && v.stav === 'navrh' ? (
                          <>
                            <FormularSPotvrzenim
                              akce={aktivujVerzi.bind(null, sablonaId, v.id)}
                              otazka={`Aktivovat verzi ${v.cislo_verze}?`}
                              popis="Dosavadní platná verze se archivuje. Aktivovanou verzi už nejde upravit ani smazat — od té chvíle se podle ní plánuje údržba."
                              potvrdit="Aktivovat"
                            >
                              <Button type="submit" size="sm">
                                Aktivovat
                              </Button>
                            </FormularSPotvrzenim>
                            <FormularSPotvrzenim
                              akce={zahodNavrh.bind(null, sablonaId, v.id)}
                              otazka={`Zahodit návrh verze ${v.cislo_verze}?`}
                              popis="Rozpracovaná matice se smaže a nepůjde obnovit."
                              potvrdit="Zahodit"
                              nebezpecne
                            >
                              <Button
                                type="submit"
                                variant="ghost"
                                size="sm"
                                className="text-muted-foreground hover:text-destructive"
                              >
                                Zahodit
                              </Button>
                            </FormularSPotvrzenim>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="text-xs text-muted-foreground">
        Aktivovanou verzi nelze změnit ani smazat — hlídá to databáze. Provedená údržba se odkazuje
        na verzi, která platila v době provedení, takže pozdější úprava šablony nepřepíše, co
        technik odškrtal.
      </p>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Zařízení
// -----------------------------------------------------------------------------

async function ZalozkaZarizeni({
  sablonaId,
  oblastId,
  maPlatnouVerzi,
  smiSpravovat,
}: {
  sablonaId: string
  oblastId: string
  maPlatnouVerzi: boolean
  smiSpravovat: boolean
}) {
  const prirazena = await nactiPrirazenaZarizeni(sablonaId)
  const prirazenaId = new Set(prirazena.map((p) => p.zarizeni_id))

  const nabidka = smiSpravovat
    ? (await nactiZarizeniProPrirazeni(oblastId)).filter((z) => !prirazenaId.has(z.id))
    : []

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock aria-hidden="true" className="h-4 w-4 text-zvyrazneni" />
            Šablonu používá {prirazena.length} {prirazena.length === 1 ? 'zařízení' : 'zařízení'}
          </CardTitle>
          <CardDescription>
            Jedna šablona pro víc strojů stejného typu. Změna matice se projeví u všech naráz.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {prirazena.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Zatím žádné. Dokud šablonu nikdo nepoužívá, nic se podle ní neplánuje.
            </p>
          ) : (
            <ul className="divide-y">
              {prirazena.map((p) => (
                <li key={p.zarizeni_id} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <Link
                      href={`/zarizeni/${p.zarizeni_id}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {p.zarizeni?.nazev}
                    </Link>
                    <p className="cislice-tabulkove text-xs text-muted-foreground">
                      {p.zarizeni?.inventarni_cislo ?? 'bez inventárního čísla'}
                      {p.zarizeni?.typ?.nazev ? ` · ${p.zarizeni.typ.nazev}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {p.zarizeni?.stav ? <ZnackaStavu stav={p.zarizeni.stav} /> : null}
                    {smiSpravovat ? (
                      <form action={odeberZarizeni.bind(null, sablonaId, p.zarizeni_id)}>
                        <Button
                          type="submit"
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground hover:text-destructive"
                        >
                          Odebrat
                          <span className="sr-only"> {p.zarizeni?.nazev}</span>
                        </Button>
                      </form>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {smiSpravovat ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Přiřadit další</CardTitle>
            <CardDescription>
              Nabízejí se stroje z téže oblasti, které šablonu ještě nemají.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!maPlatnouVerzi ? (
              <p className="mb-4 rounded-md border border-stav-dnes/40 bg-stav-dnes/5 p-3 text-xs">
                Šablona nemá platnou verzi. Přiřadit ji jde, ale plánovat se podle ní začne až po
                aktivaci první verze.
              </p>
            ) : null}

            {nabidka.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Všechna zařízení oblasti už šablonu mají, nebo v ní žádná nejsou.
              </p>
            ) : (
              <form action={prirazZarizeni.bind(null, sablonaId, oblastId)} className="space-y-4">
                <ul className="max-h-80 space-y-1 overflow-y-auto">
                  {nabidka.map((z) => (
                    <li key={z.id}>
                      <label className="flex items-start gap-3 rounded-md p-2 hover:bg-accent">
                        <input
                          type="checkbox"
                          name="zarizeni"
                          value={z.id}
                          className="mt-0.5 size-5 rounded border-input"
                        />
                        <span className="min-w-0 text-sm">
                          {z.nazev}
                          <span className="cislice-tabulkove block text-xs text-muted-foreground">
                            {z.inventarni_cislo ?? 'bez inv. čísla'}
                            {z.typ?.nazev ? ` · ${z.typ.nazev}` : ''}
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
                <Button type="submit" size="dotyk" className="w-full">
                  Přiřadit vybrané
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

// -----------------------------------------------------------------------------

function Stitek({
  ikona: Ikona,
  cislice = false,
  children,
}: {
  ikona: typeof Hash
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

function celeJmeno(osoba?: { jmeno?: string | null; prijmeni?: string | null } | null): string {
  if (!osoba) return ''
  return [osoba.jmeno, osoba.prijmeni].filter(Boolean).join(' ').trim()
}
