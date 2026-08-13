import { popisekStavu } from '@/lib/zarizeni/formular'

/**
 * Odznak stavu zařízení.
 *
 * Barvy nesou význam, ne značku: v provozu je zelená („v pořádku"), v opravě
 * červená. Odstavené a vyřazené zůstávají šedé - nejsou to poruchy, jen stroje
 * mimo hru. Vyřazené navíc přeškrtnuté, aby se stav poznal i bez barvy.
 */
const VZHLED: Record<string, string> = {
  v_provozu: 'bg-stav-splneno/10 text-stav-splneno',
  odstaveno: 'bg-muted text-muted-foreground',
  v_oprave: 'bg-stav-poterminu/10 text-stav-poterminu',
  vyrazeno: 'bg-muted text-muted-foreground line-through',
}

export function ZnackaStavu({ stav }: { stav: string }) {
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium ${
        VZHLED[stav] ?? 'bg-secondary text-secondary-foreground'
      }`}
    >
      {popisekStavu(stav)}
    </span>
  )
}
