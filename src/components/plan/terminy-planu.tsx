'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import { ZnackaTerminu } from '@/components/plan/znacka-terminu'
import { popisIntervalu } from '@/lib/sablony/interval'
import type { RadekPlanu } from '@/lib/plan/dotazy'
import type { StavTerminu } from '@/app/(aplikace)/zarizeni/[id]/plan-actions'

function TlacitkoUlozit() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="dotyk" disabled={pending}>
      {pending ? 'Ukládám…' : 'Uložit termíny'}
    </Button>
  )
}

/**
 * Plán údržby jednoho stroje s poli na termíny.
 *
 * Jeden formulář přes celou tabulku, ne políčko po políčku. Garant zakládá plán
 * najednou pro celou matici - šestnáct samostatných uložení by znamenalo
 * šestnáct kol sítě a šestnáct hlášek.
 *
 * Původní hodnota jde s formulářem jako skryté pole. Serverová akce díky tomu
 * pošle do databáze jen řádky, kde se datum opravdu změnilo, a auditní log
 * nezaplaví šestnáct zápisů při každém uložení.
 */
export function TerminyPlanu({
  radky,
  dnes,
  smiUpravovat,
  akce,
}: {
  radky: RadekPlanu[]
  dnes: string
  smiUpravovat: boolean
  akce: (predchozi: StavTerminu, formData: FormData) => Promise<StavTerminu>
}) {
  const [stav, formAction] = useActionState<StavTerminu, FormData>(akce, {})

  const chybejici = radky.filter((r) => r.aktivni && !r.dalsiTermin).length

  return (
    <form action={formAction} className="space-y-4">
      {chybejici > 0 ? (
        <div className="rounded-md border border-stav-poterminu/40 bg-stav-poterminu/5 p-4 text-sm">
          <p className="font-medium">
            {chybejici === 1
              ? 'Jeden úkon čeká na termín.'
              : `${chybejici} úkonů čeká na termín.`}
          </p>
          <p className="mt-1 text-muted-foreground">
            {smiUpravovat
              ? 'Dokud termín nezadáte, plánovač úkon přeskakuje a zakázka na něj nevznikne.'
              : 'Termíny doplňuje garant oblasti.'}
          </p>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="hlavicka-tabulky">
            <tr>
              <th className="px-4 py-3 font-medium">Úkon</th>
              <th className="px-4 py-3 font-medium">Interval</th>
              <th className="px-4 py-3 font-medium">Profese</th>
              <th className="px-4 py-3 font-medium">Příště</th>
              <th className="px-4 py-3 font-medium">Naposledy</th>
            </tr>
          </thead>
          <tbody>
            {radky.map((r) => (
              <tr
                key={r.id}
                className={`border-b last:border-0 ${r.aktivni ? '' : 'text-muted-foreground'}`}
              >
                <td className="px-4 py-3">
                  <span className="font-medium">{r.ukon?.nazev ?? 'úkon už není v matici'}</span>
                  <span className="block text-xs text-muted-foreground">{r.sablonaNazev}</span>
                  {!r.aktivni ? (
                    <span className="mt-1 inline-flex rounded-md bg-muted px-2 py-0.5 text-xs">
                      vyřazeno z matice — neplánuje se
                    </span>
                  ) : null}
                </td>

                <td className="px-4 py-3 text-muted-foreground">
                  {r.ukon
                    ? popisIntervalu(r.ukon.intervalTyp, r.ukon.intervalHodnota)
                    : '—'}
                </td>

                <td className="px-4 py-3 text-muted-foreground">{r.ukon?.profese ?? '—'}</td>

                <td className="px-4 py-3">
                  {smiUpravovat && r.aktivni ? (
                    <>
                      <input type="hidden" name={`puvodni:${r.id}`} value={r.dalsiTermin ?? ''} />
                      <input
                        type="date"
                        name={`termin:${r.id}`}
                        defaultValue={r.dalsiTermin ?? ''}
                        aria-label={`Termín úkonu ${r.ukon?.nazev ?? ''}`}
                        className="h-dotyk w-full min-w-[10rem] rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                    </>
                  ) : (
                    <ZnackaTerminu termin={r.dalsiTermin} dnes={dnes} />
                  )}
                </td>

                <td className="px-4 py-3 text-muted-foreground">
                  {r.posledniProvedenoAt
                    ? new Intl.DateTimeFormat('cs-CZ', {
                        dateStyle: 'medium',
                        timeZone: 'Europe/Prague',
                      }).format(new Date(r.posledniProvedenoAt))
                    : 'zatím nikdy'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {stav.chyba ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {stav.chyba}
        </p>
      ) : null}

      {stav.hotovo ? (
        <p role="status" className="text-sm font-medium text-stav-splneno">
          {stav.hotovo}
        </p>
      ) : null}

      {smiUpravovat ? (
        <div className="flex flex-wrap items-center gap-4">
          <TlacitkoUlozit />
          <p className="text-xs text-muted-foreground">
            Prázdné pole termín zruší. Řádek zůstane i s poslední údržbou, jen se přestane
            plánovat.
          </p>
        </div>
      ) : null}
    </form>
  )
}
