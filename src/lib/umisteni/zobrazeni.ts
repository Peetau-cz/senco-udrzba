/**
 * Zobrazení umístění pro uživatele.
 *
 * Samotný název provozu nestačí: „CNC" nebo „Linka B" bez haly neřekne, kam se
 * jde. Cesta se proto skládá z haly a provozu.
 *
 * Kořen areálu se v cestě vynechává - všechno je v areálu, takže by to byla
 * jen delší věta beze změny významu.
 */

export const KOD_KORENE = 'AREAL'

export type UmisteniSCestou = {
  nazev: string
  kod?: string | null
  nadrazene?: { nazev: string; kod?: string | null } | null
} | null

export function cestaUmisteni(umisteni: UmisteniSCestou, nahrada = '—'): string {
  if (!umisteni) return nahrada

  const nadrazene = umisteni.nadrazene
  if (!nadrazene || nadrazene.kod === KOD_KORENE) return umisteni.nazev

  return `${nadrazene.nazev} / ${umisteni.nazev}`
}
