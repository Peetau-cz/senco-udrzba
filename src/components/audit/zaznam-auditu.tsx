import { FilePlus2, PencilLine, Trash2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { formatDatumCas } from '@/lib/datum'
import { nadpisZaznamu, popisHodnoty, popisSloupce, popisTabulky } from '@/lib/audit/popisky'
import { spoctiRozdil, type Operace } from '@/lib/audit/rozdil'

type Zaznam = {
  id: number
  tabulka: string
  zaznam_id: string
  operace: Operace
  stary_stav: Record<string, unknown> | null
  novy_stav: Record<string, unknown> | null
  uzivatel_id: string | null
  cas: string
}

const OPERACE: Record<Operace, { popis: string; ikona: typeof PencilLine; barva: string }> = {
  INSERT: { popis: 'Založeno', ikona: FilePlus2, barva: 'text-stav-splneno' },
  UPDATE: { popis: 'Změna', ikona: PencilLine, barva: 'text-muted-foreground' },
  DELETE: { popis: 'Smazáno', ikona: Trash2, barva: 'text-destructive' },
}

/**
 * Kdo změnu provedl.
 *
 * Prázdné `uzivatel_id` není chyba: noční plánovač zakládá zakázky bez
 * přihlášeného člověka a totéž platí pro zásahy z SQL editoru. „Systém" je
 * poctivější odpověď než prázdno.
 *
 * Když se jméno nenajde, účet už neexistuje - audit tomu má přežít, proto
 * `audit_log.uzivatel_id` schválně nemá cizí klíč do profilů.
 */
function kdo(uzivatelId: string | null, jmena: ReadonlyMap<string, string>): string {
  if (!uzivatelId) return 'systém'

  return jmena.get(uzivatelId) ?? `neznámý uživatel (${uzivatelId.slice(0, 8)}…)`
}

export function ZaznamAuditu({
  zaznam,
  jmena,
}: {
  zaznam: Zaznam
  jmena: ReadonlyMap<string, string>
}) {
  const snimek = zaznam.novy_stav ?? zaznam.stary_stav
  const rozdil = spoctiRozdil(zaznam.operace, zaznam.stary_stav, zaznam.novy_stav)
  const { popis, ikona: Ikona, barva } = OPERACE[zaznam.operace]

  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="font-medium">
            {popisTabulky(zaznam.tabulka)}
            <span className="text-muted-foreground"> · </span>
            {nadpisZaznamu(snimek, zaznam.zaznam_id, jmena)}
          </h2>

          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Ikona aria-hidden="true" className={`size-4 shrink-0 ${barva}`} />
            <span className={barva}>{popis}</span>
            <span aria-hidden="true">·</span>
            <span>{kdo(zaznam.uzivatel_id, jmena)}</span>
            <span aria-hidden="true">·</span>
            <time dateTime={zaznam.cas}>{formatDatumCas(zaznam.cas)}</time>
          </p>
        </div>

        {rozdil.length === 0 ? (
          // Stane se, když někdo odešle formulář bez úpravy. Záznam vznikl,
          // ale nemá co ukázat - mlčet by vypadalo jako chyba.
          <p className="text-sm text-muted-foreground">Uloženo beze změny hodnot.</p>
        ) : (
          <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[minmax(8rem,14rem)_1fr]">
            {rozdil.map((zmena) => (
              <div key={zmena.sloupec} className="contents">
                <dt className="text-muted-foreground">{popisSloupce(zmena.sloupec)}</dt>
                <dd className="min-w-0 break-words">
                  {zaznam.operace === 'UPDATE' ? (
                    <>
                      <span className="text-muted-foreground line-through">
                        {popisHodnoty(zmena.pred, zmena.sloupec, jmena)}
                      </span>
                      <span aria-hidden="true" className="mx-2 text-muted-foreground">
                        →
                      </span>
                      <span>{popisHodnoty(zmena.po, zmena.sloupec, jmena)}</span>
                    </>
                  ) : (
                    <span>
                      {popisHodnoty(
                        zaznam.operace === 'DELETE' ? zmena.pred : zmena.po,
                        zmena.sloupec,
                        jmena,
                      )}
                    </span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </CardContent>
    </Card>
  )
}
