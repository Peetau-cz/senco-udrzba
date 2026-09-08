import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ScrollText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { ZaznamAuditu } from '@/components/audit/zaznam-auditu'
import { maPravo } from '@/lib/auth/opravneni'
import { nactiPrihlaseneho } from '@/lib/auth/session'
import { AUDITOVANE_TABULKY } from '@/lib/audit/popisky'
import { nactiAudit, nactiMapuJmen, nactiUzivateleProFiltr } from '@/lib/audit/dotazy'

export const metadata = { title: 'Audit' }

type Parametry = Record<string, string | string[] | undefined>

function jedna(parametry: Parametry, klic: string): string | undefined {
  const hodnota = parametry[klic]
  return typeof hodnota === 'string' && hodnota !== '' ? hodnota : undefined
}

/**
 * Auditní log (modul M6, zadání ř. 157-162).
 *
 * Data se sbírají od migrace 0001 - do `audit_log` zapisuje univerzální trigger
 * nad devatenácti tabulkami. Chyběla jen obrazovka, proto tenhle modul žádnou
 * migraci nepotřebuje.
 *
 * Kdo smí číst, rozhoduje politika `audit_log_select`, ne tahle stránka. Kontrola
 * `maPravo` níž je jen kvůli srozumitelné hlášce; kdyby se obojí rozešlo,
 * uživatel dostane prázdný seznam, nikdy cizí data (zásada R1).
 */
export default async function StrankaAudit({
  searchParams,
}: {
  searchParams: Promise<Parametry>
}) {
  const uzivatel = await nactiPrihlaseneho()
  if (!uzivatel) redirect('/login')

  const smiCist = maPravo(uzivatel.role, 'audit', 'cteni')

  if (!smiCist) {
    return (
      <div className="max-w-3xl space-y-6">
        <h1 className="text-2xl font-semibold">Audit</h1>
        <Card>
          <CardContent className="py-10 text-center">
            <p className="font-medium">Auditní log nemáte právo číst.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Přístup má administrátor, vedoucí údržby a management.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const parametry = await searchParams

  const tabulka = jedna(parametry, 'tabulka')
  const kdo = jedna(parametry, 'kdo')
  const od = jedna(parametry, 'od')
  const doKdy = jedna(parametry, 'do')
  const strana = Number(jedna(parametry, 'strana') ?? '1')

  const [stranka, jmena, lide] = await Promise.all([
    nactiAudit({ tabulka, uzivatelId: kdo, od, do: doKdy, strana }),
    nactiMapuJmen(),
    nactiUzivateleProFiltr(),
  ])

  const jeFiltrovano = Boolean(tabulka || kdo || od || doKdy)

  const adresaStrany = (cislo: number) => {
    const dotaz = new URLSearchParams()
    if (tabulka) dotaz.set('tabulka', tabulka)
    if (kdo) dotaz.set('kdo', kdo)
    if (od) dotaz.set('od', od)
    if (doKdy) dotaz.set('do', doKdy)
    if (cislo > 1) dotaz.set('strana', String(cislo))

    const text = dotaz.toString()
    return text ? `/audit?${text}` : '/audit'
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Audit</h1>
        <p className="text-muted-foreground">
          {stranka.celkem === 0
            ? 'Kdo co změnil a kdy. Záznamy nelze mazat ani upravovat.'
            : `${jeFiltrovano ? 'Nalezeno' : 'Záznamů'}: ${stranka.celkem}. Nejnovější nahoře.`}
        </p>
      </div>

      {/* Filtr je obyčejný GET formulář — funguje i bez javascriptu a odkaz na
          vyfiltrovaný audit jde poslat kolegovi. */}
      <Card>
        <CardContent className="py-4">
          <form method="get" className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label htmlFor="filtr-tabulka" className="text-xs text-muted-foreground">
                Čeho se změna týkala
              </label>
              <Select
                id="filtr-tabulka"
                name="tabulka"
                defaultValue={tabulka ?? ''}
                className="w-56"
              >
                <option value="">Všechno</option>
                {AUDITOVANE_TABULKY.map((polozka) => (
                  <option key={polozka.tabulka} value={polozka.tabulka}>
                    {polozka.popis}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-1">
              <label htmlFor="filtr-kdo" className="text-xs text-muted-foreground">
                Kdo změnu provedl
              </label>
              <Select id="filtr-kdo" name="kdo" defaultValue={kdo ?? ''} className="w-56">
                <option value="">Kdokoli</option>
                {lide.map((osoba) => (
                  <option key={osoba.id} value={osoba.id}>
                    {osoba.jmeno}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-1">
              <label htmlFor="filtr-od" className="text-xs text-muted-foreground">
                Od
              </label>
              <Input id="filtr-od" name="od" type="date" defaultValue={od ?? ''} />
            </div>

            <div className="space-y-1">
              <label htmlFor="filtr-do" className="text-xs text-muted-foreground">
                Do
              </label>
              <Input id="filtr-do" name="do" type="date" defaultValue={doKdy ?? ''} />
            </div>

            <Button type="submit" size="dotyk">
              Filtrovat
            </Button>

            {jeFiltrovano ? (
              <Button asChild size="dotyk" variant="outline">
                <Link href="/audit">Zrušit filtr</Link>
              </Button>
            ) : null}
          </form>
        </CardContent>
      </Card>

      {stranka.zaznamy.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <ScrollText aria-hidden="true" className="mx-auto size-8 text-muted-foreground" />
            <p className="mt-3 font-medium">
              {jeFiltrovano ? 'Tomuhle filtru nic neodpovídá.' : 'Audit je zatím prázdný.'}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {jeFiltrovano
                ? 'Zkuste širší období nebo jinou oblast změn.'
                : 'Jakmile někdo něco změní, objeví se to tady.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {stranka.zaznamy.map((zaznam) => (
            <ZaznamAuditu key={zaznam.id} zaznam={zaznam} jmena={jmena} />
          ))}
        </div>
      )}

      {stranka.stran > 1 ? (
        <div className="flex items-center justify-between gap-4">
          <Button
            asChild={stranka.strana > 1}
            disabled={stranka.strana <= 1}
            size="dotyk"
            variant="outline"
          >
            {stranka.strana > 1 ? (
              <Link href={adresaStrany(stranka.strana - 1)}>Novější</Link>
            ) : (
              <span>Novější</span>
            )}
          </Button>

          <p className="text-sm text-muted-foreground">
            Strana {stranka.strana} z {stranka.stran}
          </p>

          <Button
            asChild={stranka.strana < stranka.stran}
            disabled={stranka.strana >= stranka.stran}
            size="dotyk"
            variant="outline"
          >
            {stranka.strana < stranka.stran ? (
              <Link href={adresaStrany(stranka.strana + 1)}>Starší</Link>
            ) : (
              <span>Starší</span>
            )}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
