import { procentoPlneni } from '@/lib/plneni/vypocet'

/**
 * Proužek plnění s procentem.
 *
 * Barva se mění podle výsledku, ne podle oblasti: pod devadesát procent je
 * červená, do sta jantarová, sto zelená. Číslo je vedle proužku vždycky —
 * proužek se čte rychle, ale přesnou hodnotu z něj nikdo neodečte, a v tabulce,
 * kterou někdo tiskne, by po vybledlé barvě nezbylo nic.
 */
export function ProuzekPlneni({
  splneno,
  celkem,
  sirka = 'w-32',
}: {
  splneno: number
  celkem: number
  sirka?: string
}) {
  const procenta = procentoPlneni(splneno, celkem)

  const barva =
    celkem === 0
      ? 'bg-muted-foreground/30'
      : procenta >= 100
        ? 'bg-stav-splneno'
        : procenta >= 90
          ? 'bg-stav-dnes'
          : 'bg-stav-poterminu'

  return (
    <div className="flex items-center gap-3">
      <div
        role="progressbar"
        aria-valuenow={procenta}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Plnění ${procenta} procent`}
        className={`h-2 overflow-hidden rounded-full bg-muted ${sirka}`}
      >
        <div className={`h-full rounded-full ${barva}`} style={{ width: `${procenta}%` }} />
      </div>

      <span className="cislice-tabulkove w-12 text-right text-sm font-medium">
        {celkem === 0 ? '—' : `${procenta} %`}
      </span>
    </div>
  )
}
