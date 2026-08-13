/**
 * Formátování data a času pro uživatele.
 *
 * Databáze drží časy v UTC, zobrazují se v Europe/Prague (zásada z README).
 * Pásmo je tu napevno schválně: závod stojí v Příbrami a technik nemá vidět jiný
 * čas jen proto, že má tablet přepnutý do jiné zóny.
 */

const PASMO = 'Europe/Prague'

export function formatDatum(hodnota: string | null | undefined): string {
  if (!hodnota) return '—'

  return new Intl.DateTimeFormat('cs-CZ', {
    dateStyle: 'medium',
    timeZone: PASMO,
  }).format(new Date(hodnota))
}

export function formatDatumCas(hodnota: string | null | undefined): string {
  if (!hodnota) return '—'

  return new Intl.DateTimeFormat('cs-CZ', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: PASMO,
  }).format(new Date(hodnota))
}
