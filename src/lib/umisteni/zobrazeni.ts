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

/** Tvar, který funkce níž potřebuje. `NabidkaUmisteni` z `dotazy.ts` mu vyhoví. */
export type NabidkaProFiltr = {
  haly: { id: string; kod: string; provozy: { id: string; kod: string }[] }[]
}

/**
 * Identifikátory umístění pro filtr seznamu zařízení.
 *
 * Vybraná hala musí zabrat i stroje ve svých provozech - kdo se ptá „co stojí
 * v hale A", nechce přijít o stroj zařazený do provozu CNC uvnitř té haly.
 * U provozu se vrací jedno id, protože provoz už žádné děti nemá.
 *
 * Adresa nese kód (`?umisteni=HALA_A`), ne identifikátor - stejně jako u typu
 * a oblasti tím zůstává odkaz čitelný a přenositelný mezi prostředími.
 *
 * Sídlí tady, ne v `dotazy.ts`: je to čistý výpočet nad daty, která už máme
 * načtená, takže se dá otestovat bez sahání na databázi.
 */
export function idsUmisteniProFiltr(nabidka: NabidkaProFiltr, kod?: string): string[] | undefined {
  if (!kod) return undefined

  for (const hala of nabidka.haly) {
    if (hala.kod === kod) return [hala.id, ...hala.provozy.map((p) => p.id)]

    const provoz = hala.provozy.find((p) => p.kod === kod)
    if (provoz) return [provoz.id]
  }

  // Neznámý kód z adresy se nefiltruje vůbec - stejně jako neznámý stav.
  // Vrátit prázdné pole by znamenalo „nic nenalezeno" a vypadalo to jako chyba.
  return undefined
}

/** Tvar, který stačí k součtu. `UzelUmisteni` z `dotazy.ts` mu vyhoví. */
export type UzelSPoctem = {
  pocetZarizeni: number
  deti: UzelSPoctem[]
}

/**
 * Zařízení v celém podstromu, ne jen ta zapsaná přímo na uzel.
 *
 * Stroj se skoro vždycky zařadí do provozu, ne rovnou do haly. Kdyby hala
 * počítala jen svoje přímá zařízení, ukazovala by u plné haly nulu. Filtr
 * seznamu zařízení bere halu i s provozy (`idsUmisteniProFiltr`) - tenhle
 * součet mu odpovídá, takže počet u haly sedí s tím, co filtr vypíše.
 */
export function pocetZarizeniVPodstromu(uzel: UzelSPoctem): number {
  return uzel.deti.reduce(
    (soucet, dite) => soucet + pocetZarizeniVPodstromu(dite),
    uzel.pocetZarizeni,
  )
}
