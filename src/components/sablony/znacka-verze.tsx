/**
 * Odznak stavu verze šablony.
 *
 * Barvy drží role z globals.css: aktivní verze je „v pořádku", tedy zelená,
 * rozdělaný návrh je zvýraznění, tedy firemní fialová. Archivovaná je šedá -
 * není to chyba, jen už neplatí.
 */
const VZHLED: Record<string, string> = {
  navrh: 'bg-stav-dnes/10 text-stav-dnes',
  aktivni: 'bg-stav-splneno/10 text-stav-splneno',
  archivovana: 'bg-muted text-muted-foreground',
}

const POPISKY: Record<string, string> = {
  navrh: 'Návrh',
  aktivni: 'Platí',
  archivovana: 'Archiv',
}

export function popisekStavuVerze(stav: string): string {
  return POPISKY[stav] ?? stav
}

export function ZnackaVerze({ stav }: { stav: string }) {
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium ${
        VZHLED[stav] ?? 'bg-secondary text-secondary-foreground'
      }`}
    >
      {popisekStavuVerze(stav)}
    </span>
  )
}
