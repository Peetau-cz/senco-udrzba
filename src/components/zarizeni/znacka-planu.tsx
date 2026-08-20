import { CircleAlert, CircleCheck } from 'lucide-react'
import type { PripravenostZarizeni } from '@/lib/zarizeni/dotazy'

/**
 * Má stroj doděláný plán údržby?
 *
 * Odhaluje tichou díru: přiřazení šablony založí řádky plánu, ale první termín
 * u každého úkonu zadává garant zvlášť a plánovač řádek bez termínu přeskakuje.
 * Stroj s pěti vyplněnými termíny z osmi vypadá v evidenci pokrytě, tři úkony
 * se ale nenaplánují nikdy.
 *
 * Výstraha proto říká ČÍSLO, ne jen vykřičník: „3 z 8 bez termínu" se dá rovnou
 * odškrtat, „něco chybí" znamená projít celou kartu stroje.
 *
 * Stav v pořádku zůstává potichu - šedý, drobný. Kdyby svítil zeleně stejně
 * silně, jako výstraha svítí červeně, přestala by výstraha být vidět.
 */
export function ZnackaPlanu({ pripravenost }: { pripravenost?: PripravenostZarizeni }) {
  // Chybí = stroj se nekontroluje. Pohled bere jen provozuschopné (0019),
  // takže vyřazený a stroj v opravě v mapě nejsou. Pomlčka to musí říct
  // nahlas - bez vysvětlení vypadá jako chybějící údaj, ne jako záměr.
  if (!pripravenost) {
    return (
      <span
        className="text-muted-foreground"
        title="Stroj není v provozu, plán se u něj nekontroluje"
      >
        —
      </span>
    )
  }

  const { stavPlanu, ukonuCelkem, ukonuBezTerminu } = pripravenost

  if (stavPlanu === 'ok') {
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-muted-foreground">
        <CircleCheck aria-hidden="true" className="size-4 shrink-0 text-stav-splneno" />
        <span className="cislice-tabulkove">{ukonuCelkem}</span>
        {popisUkonu(ukonuCelkem)}
      </span>
    )
  }

  const popis =
    stavPlanu === 'bez_sablony'
      ? 'bez šablony'
      : stavPlanu === 'bez_ukonu'
        ? 'šablona bez verze'
        : `${ukonuBezTerminu} z ${ukonuCelkem} bez termínu`

  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-sm font-medium text-destructive">
      <CircleAlert aria-hidden="true" className="size-3.5 shrink-0" />
      {popis}
    </span>
  )
}

/** 1 úkon · 2–4 úkony · 5+ úkonů. */
function popisUkonu(pocet: number): string {
  if (pocet === 1) return 'úkon'
  if (pocet < 5) return 'úkony'
  return 'úkonů'
}
