import Link from 'next/link'
import { CalendarClock, CheckCircle2, Percent, TriangleAlert } from 'lucide-react'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dlazdice } from '@/components/plneni/dlazdice'
import { ProuzekPlneni } from '@/components/plneni/prouzek-plneni'
import { ZnackaTerminu } from '@/components/plan/znacka-terminu'
import { maPravo } from '@/lib/auth/opravneni'
import { nactiPrihlaseneho } from '@/lib/auth/session'
import { formatDatumCas } from '@/lib/datum'
import { celeJmeno } from '@/lib/plan/dotazy'
import { dnesVPraze } from '@/lib/plan/terminy'
import {
  nactiDnesniPlan,
  nactiPlneni,
  nactiPosledniProvedene,
  nactiPoTerminu,
} from '@/lib/plneni/dotazy'
import { popisObdobi, procentoPlneni, souhrnPlneni, zacatekMesice } from '@/lib/plneni/vypocet'

export const metadata = { title: 'Dashboard' }

/**
 * Dashboard podle wireframu v docs/NAVRH.md kap. 5.1.
 *
 * Je to první obrazovka po přihlášení (zadání ř. 56, nikdy ne seznam zařízení)
 * a zadání na ni klade konkrétní požadavek: uživatel má během několika sekund
 * vidět, co má dnes udělat, co je po termínu a co se děje v jeho oblasti
 * (ř. 176-179).
 *
 * Čísla se nefiltrují podle oblasti uživatele - pohledy jsou `security_invoker`,
 * takže údržbář CNC dostane ze stejného dotazu jen svou oblast. Management vidí
 * všechno, ale nikde nedostane tlačítko na provedení.
 */
export default async function Dashboard() {
  const uzivatel = await nactiPrihlaseneho()
  if (!uzivatel) redirect('/login')

  const dnes = dnesVPraze()
  const obdobi = zacatekMesice(dnes)
  const smiProvadetUdrzbu = maPravo(uzivatel.role, 'provedeni', 'zapis')

  const [dnesniPlan, poTerminu, plneni, posledni] = await Promise.all([
    nactiDnesniPlan(),
    nactiPoTerminu(),
    nactiPlneni(obdobi),
    nactiPosledniProvedene(),
  ])

  const souhrn = souhrnPlneni(plneni)
  const sOblastmi = plneni.filter((o) => o.celkem > 0 || o.neprovedeno > 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dobrý den, {uzivatel.jmeno || uzivatel.email}.</h1>
        <p className="text-muted-foreground">
          {smiProvadetUdrzbu
            ? 'Co máte dnes udělat a co je po termínu.'
            : 'Přehled plnění údržby napříč oblastmi.'}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Dlazdice
          popisek="Dnes"
          hodnota={dnesniPlan.length}
          poznamka={dnesniPlan.length === 0 ? 'na dnešek nic naplánováno' : 'zakázek k provedení'}
          ikona={CalendarClock}
          odstin={dnesniPlan.length > 0 ? 'dnes' : 'klid'}
        />
        <Dlazdice
          popisek="Po termínu"
          hodnota={poTerminu.length}
          poznamka={poTerminu.length === 0 ? 'nic nezůstalo viset' : 'zakázek po termínu'}
          ikona={TriangleAlert}
          odstin={poTerminu.length > 0 ? 'poterminu' : 'splneno'}
        />
        <Dlazdice
          popisek={popisObdobi(obdobi)}
          hodnota={`${souhrn.splneno} / ${souhrn.celkem}`}
          poznamka="úkonů splněno v termínu"
          ikona={CheckCircle2}
          odstin="klid"
        />
        <Dlazdice
          popisek="Plnění"
          hodnota={souhrn.celkem === 0 ? '—' : `${procentoPlneni(souhrn.splneno, souhrn.celkem)} %`}
          poznamka={
            souhrn.neprovedeno > 0
              ? `${souhrn.neprovedeno} × nešlo provést, mimo výpočet`
              : 'z toho, co už bylo splatné'
          }
          ikona={Percent}
          odstin="klid"
        />
      </div>

      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Dnešní plán</CardTitle>
            <CardDescription>
              Zakázky splatné dnes. Jedna zakázka je jedna cesta ke stroji.
            </CardDescription>
          </div>
          <Link href="/plan" className="text-sm underline underline-offset-4">
            Celý plán
          </Link>
        </CardHeader>
        <CardContent>
          <SeznamZakazek
            zakazky={dnesniPlan.slice(0, 8)}
            prazdno="Na dnešek nemáte nic naplánovaného."
            dnes={dnes}
            celkem={dnesniPlan.length}
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Po termínu</CardTitle>
            <CardDescription>Nejdéle čekající nahoře.</CardDescription>
          </CardHeader>
          <CardContent>
            <SeznamZakazek
              zakazky={poTerminu.slice(0, 8)}
              prazdno="Nic nezůstalo viset. Dobrá zpráva."
              dnes={dnes}
              celkem={poTerminu.length}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle className="text-base">Přehled oblastí</CardTitle>
              <CardDescription>{popisObdobi(obdobi)}, k dnešnímu dni.</CardDescription>
            </div>
            <Link href="/plneni" className="text-sm underline underline-offset-4">
              Detail
            </Link>
          </CardHeader>
          <CardContent>
            {sOblastmi.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                V tomto měsíci zatím nebyla splatná žádná údržba.
              </p>
            ) : (
              <ul className="space-y-3">
                {sOblastmi.map((o) => (
                  <li key={o.oblastId} className="flex items-center justify-between gap-4">
                    <span className="min-w-0 truncate text-sm">{o.oblastNazev}</span>
                    <ProuzekPlneni splneno={o.splneno} celkem={o.celkem} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Poslední provedené</CardTitle>
        </CardHeader>
        <CardContent>
          {posledni.length === 0 ? (
            <p className="text-sm text-muted-foreground">Zatím nebyla dokončená žádná údržba.</p>
          ) : (
            <ul className="divide-y">
              {posledni.map((z) => (
                <li key={z.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <Link
                    href={`/zakazky/${z.id}`}
                    className="text-sm font-medium underline-offset-4 hover:underline"
                  >
                    {z.zarizeni?.nazev ?? 'neznámé zařízení'}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {formatDatumCas(z.dokonceno_at)}
                    {celeJmeno(z.dokoncil) ? ` · ${celeJmeno(z.dokoncil)}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// -----------------------------------------------------------------------------

type ZakazkaVSeznamu = {
  zakazka_id: string
  zarizeni_nazev: string
  inventarni_cislo: string | null
  planovany_termin: string
  profese_nazev: string
  kroku: number
  vyrizeno: number
}

/** Společný seznam pro dnešek i pro restance — liší se jen tím, co je v něm. */
function SeznamZakazek({
  zakazky,
  prazdno,
  dnes,
  celkem,
}: {
  zakazky: ZakazkaVSeznamu[]
  prazdno: string
  dnes: string
  celkem: number
}) {
  if (zakazky.length === 0) {
    return <p className="text-sm text-muted-foreground">{prazdno}</p>
  }

  return (
    <>
      <ul className="divide-y">
        {zakazky.map((z) => (
          <li key={z.zakazka_id} className="flex flex-wrap items-center justify-between gap-3 py-2">
            <div className="min-w-0">
              <Link
                href={`/zakazky/${z.zakazka_id}`}
                className="text-sm font-medium underline-offset-4 hover:underline"
              >
                {z.zarizeni_nazev}
              </Link>
              <span className="block text-xs text-muted-foreground">
                {z.profese_nazev} · {z.vyrizeno} z {z.kroku} hotovo
              </span>
            </div>
            <ZnackaTerminu termin={z.planovany_termin} dnes={dnes} />
          </li>
        ))}
      </ul>

      {celkem > zakazky.length ? (
        <p className="pt-2 text-xs text-muted-foreground">… a další {celkem - zakazky.length}</p>
      ) : null}
    </>
  )
}
