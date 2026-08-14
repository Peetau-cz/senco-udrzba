import { Camera, CircleCheck, PenLine, Ruler } from 'lucide-react'
import { popisIntervalu, popisTolerance, type TypIntervalu } from '@/lib/sablony/interval'
import { prectiBody } from '@/lib/sablony/kontrolni-body'

type Ukon = {
  id: string
  poradi: number
  nazev: string
  popis: string | null
  // Union je shodný s enumem interval_typ v databázi, takže tu nic nepřetypováváme.
  interval_typ: TypIntervalu
  interval_hodnota: number
  interval_zaklad: string
  tolerance_dny: number
  kontrolni_body: unknown
  vyzaduje_foto: boolean
  vyzaduje_hodnotu: boolean
  nabizi_poznamku: boolean
  jednotka: string | null
  mez_min: number | null
  mez_max: number | null
  profese?: { nazev: string } | null
}

/** Jednotka pro bod druhu „hodnota". Bere se z úkonu - bod vlastní nemá. */
function jednotkaBodu(ukon: Ukon): string {
  return ukon.jednotka ? ` v ${ukon.jednotka}` : ''
}

/** „0 – 0,05 mm", „min. 3,5 l", „max. 80 °C" - podle toho, které meze jsou zadané. */
function popisMezi(ukon: Ukon): string | null {
  if (!ukon.vyzaduje_hodnotu) return null

  const jednotka = ukon.jednotka ?? ''
  const cislo = (h: number) => h.toString().replace('.', ',')

  if (ukon.mez_min !== null && ukon.mez_max !== null) {
    return `${cislo(ukon.mez_min)} – ${cislo(ukon.mez_max)} ${jednotka}`.trim()
  }
  if (ukon.mez_min !== null) return `min. ${cislo(ukon.mez_min)} ${jednotka}`.trim()
  if (ukon.mez_max !== null) return `max. ${cislo(ukon.mez_max)} ${jednotka}`.trim()

  return `měří se v ${jednotka}`.trim()
}

/**
 * Matice úkonů ke čtení.
 *
 * Používá se u platné i u archivované verze. Archivovaná se nikdy nemění, takže
 * tenhle pohled je zároveň doklad o tom, co technik v dané době odškrtával (R3).
 */
export function NahledMatice({ ukony }: { ukony: Ukon[] }) {
  if (ukony.length === 0) {
    return <p className="text-sm text-muted-foreground">Tahle verze nemá žádné úkony.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="py-2 pr-3 font-medium">#</th>
            <th className="py-2 pr-3 font-medium">Úkon</th>
            <th className="py-2 pr-3 font-medium">Interval</th>
            <th className="py-2 pr-3 font-medium">Provádí</th>
            <th className="py-2 font-medium">Zápis</th>
          </tr>
        </thead>
        <tbody>
          {ukony.map((ukon) => {
            const body = prectiBody(ukon.kontrolni_body)
            const meze = popisMezi(ukon)

            return (
              <tr key={ukon.id} className="border-b align-top last:border-0">
                <td className="cislice-tabulkove py-3 pr-3 text-muted-foreground">{ukon.poradi}</td>
                <td className="py-3 pr-3">
                  <p className="font-medium">{ukon.nazev}</p>
                  {ukon.popis ? (
                    <p className="mt-0.5 whitespace-pre-line text-xs text-muted-foreground">
                      {ukon.popis}
                    </p>
                  ) : null}
                  {/* Druh zápisu se u bodu vypisuje slovy - z názvu samotného
                      není poznat, jestli se tam měří, nebo jen odškrtává. */}
                  {body.length > 0 ? (
                    <ul className="mt-1.5 space-y-0.5">
                      {body.map((bod, poradi) => (
                        <li key={poradi} className="flex items-baseline gap-2 text-xs">
                          <span className="text-muted-foreground">•</span>
                          <span>{bod.nazev}</span>
                          <span className="text-muted-foreground">
                            {bod.typ === 'ano_ne' ? 'ano/ne' : `hodnota${jednotkaBodu(ukon)}`}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </td>
                <td className="py-3 pr-3">
                  <p>{popisIntervalu(ukon.interval_typ, ukon.interval_hodnota)}</p>
                  <p className="text-xs text-muted-foreground">
                    {popisTolerance(ukon.tolerance_dny)}
                    {/* Vypisuje se jen odchylka od výchozího pevného kalendáře. */}
                    {ukon.interval_zaklad === 'od_provedeni' ? ' · od provedení' : ''}
                  </p>
                </td>
                <td className="py-3 pr-3">{ukon.profese?.nazev ?? '—'}</td>
                <td className="py-3">
                  <div className="flex flex-wrap gap-2">
                    {/* Ano/ne má úkon vždycky, proto stojí první a nemá podmínku. */}
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-2 py-1 text-xs">
                      <CircleCheck aria-hidden="true" className="h-3.5 w-3.5 text-zvyrazneni" />
                      ano/ne
                    </span>
                    {ukon.nabizi_poznamku ? (
                      <span className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-2 py-1 text-xs">
                        <PenLine aria-hidden="true" className="h-3.5 w-3.5 text-zvyrazneni" />
                        poznámka
                      </span>
                    ) : null}
                    {ukon.vyzaduje_foto ? (
                      <span className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-2 py-1 text-xs">
                        <Camera aria-hidden="true" className="h-3.5 w-3.5 text-zvyrazneni" />
                        foto
                      </span>
                    ) : null}
                    {meze ? (
                      <span className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-2 py-1 text-xs">
                        <Ruler aria-hidden="true" className="h-3.5 w-3.5 text-zvyrazneni" />
                        {meze}
                      </span>
                    ) : null}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
