import { FileText, ImageIcon } from 'lucide-react'
import { TlacitkoSmazat } from '@/components/ui/tlacitko-smazat'
import { formatDatum } from '@/lib/datum'
import type { SouborZarizeni } from '@/lib/zarizeni/dotazy'
import { DRUHY_SOUBORU, formatVelikost, jeObrazek } from '@/lib/zarizeni/soubory'

function celeJmeno(nahral: SouborZarizeni['nahral']): string {
  if (!nahral) return 'neznámý'
  return [nahral.jmeno, nahral.prijmeni].filter(Boolean).join(' ').trim() || nahral.email
}

/**
 * Přílohy karty rozdělené podle druhu.
 *
 * Odkaz na soubor je podepsaný a platí hodinu (viz nactiSouboryZarizeni), proto
 * se stránka nedá odložit v záložkách a otevřít za týden - to je záměr, ne chyba.
 */
export function SeznamSouboru({
  soubory,
  zarizeniId,
  smiSpravovat,
  smazAkce,
}: {
  soubory: SouborZarizeni[]
  zarizeniId: string
  smiSpravovat: boolean
  smazAkce: (zarizeniId: string, souborId: string) => Promise<void>
}) {
  if (soubory.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Ke kartě zatím nic není. Patří sem fotka stroje, návod k obsluze a certifikáty.
      </p>
    )
  }

  return (
    <div className="space-y-6">
      {DRUHY_SOUBORU.map((druh) => {
        const skupina = soubory.filter((s) => s.druh === druh.hodnota)
        if (skupina.length === 0) return null

        return (
          <section key={druh.hodnota} className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground">{druh.mnozne}</h3>

            <ul className="divide-y rounded-md border">
              {skupina.map((soubor) => {
                const Ikona = jeObrazek(soubor.mime) ? ImageIcon : FileText

                return (
                  <li key={soubor.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                    <Ikona className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />

                    <div className="min-w-0 flex-1">
                      {soubor.odkaz ? (
                        <a
                          href={soubor.odkaz}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium hover:underline"
                        >
                          {soubor.nazev}
                        </a>
                      ) : (
                        <span className="font-medium">{soubor.nazev}</span>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {formatVelikost(soubor.velikost_b)} · nahrál {celeJmeno(soubor.nahral)} ·{' '}
                        {formatDatum(soubor.vytvoreno_at)}
                      </p>
                    </div>

                    {smiSpravovat ? (
                      <TlacitkoSmazat
                        akce={smazAkce.bind(null, zarizeniId, soubor.id)}
                        nazev={soubor.nazev}
                        popisek="Smazat"
                      />
                    ) : null}
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
