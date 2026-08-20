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
      className={`inline-flex whitespace-nowrap rounded-md px-2 py-0.5 text-sm font-medium ${
        VZHLED[stav] ?? 'bg-secondary text-secondary-foreground'
      }`}
    >
      {popisekStavu(stav)}
    </span>
  )
}

/**
 * Pruh stavu u levé hrany řádku tabulky.
 *
 * Táž barva jako ve značce, jen roztažená do hrany. Ve výpisu strojů se tím dá
 * přejet očima sloupec a vidět, co je v opravě, aniž by se četl každý řádek.
 * Odstavené a vyřazené zůstávají v barvě rýsky - nejsou to poruchy.
 */
const PRUH: Record<string, string> = {
  v_provozu: 'border-l-stav-splneno',
  odstaveno: 'border-l-border',
  v_oprave: 'border-l-stav-poterminu',
  vyrazeno: 'border-l-border',
}

export function pruhStavu(stav: string): string {
  return PRUH[stav] ?? 'border-l-border'
}
