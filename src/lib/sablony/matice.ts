/**
 * Převod řádků editoru matice na úkony k uložení.
 *
 * Pravidla zrcadlí omezení z migrace 0006 - `sablona_ukon_mereni_ma_jednotku`,
 * `sablona_ukon_meze_ve_spravnem_poradi` a spol. Smysl je, aby garant dostal
 * hlášku u konkrétního řádku dřív, než mu databáze odmítne celou matici.
 * Autoritou zůstává databáze (zásada R1).
 *
 * Bez závislosti na Reactu a Supabase, aby šel soubor testovat samostatně
 * (matice.test.ts).
 */

import {
  jeTypIntervalu,
  jeZakladIntervalu,
  type TypIntervalu,
  type ZakladIntervalu,
} from '@/lib/sablony/interval'
import { ocistiBody, type KontrolniBod } from '@/lib/sablony/kontrolni-body'

/** Co drží editor. Textová pole, protože přišla z formuláře. */
export type RadekUkonu = {
  nazev: string
  popis: string
  interval_typ: string
  interval_hodnota: string
  interval_zaklad: string
  tolerance_dny: string
  profese_role_id: string
  /** Každý bod má vlastní druh zápisu, viz kontrolni-body.ts. */
  kontrolni_body: KontrolniBod[]
  vyzaduje_foto: boolean
  vyzaduje_hodnotu: boolean
  /** Pole na volný text. Potvrzení ano/ne má úkon vždy, to se nenastavuje. */
  nabizi_poznamku: boolean
  jednotka: string
  mez_min: string
  mez_max: string
}

export type UkonKUlozeni = {
  poradi: number
  nazev: string
  popis: string | null
  interval_typ: TypIntervalu
  interval_hodnota: number
  interval_zaklad: ZakladIntervalu
  tolerance_dny: number
  profese_role_id: string
  kontrolni_body: KontrolniBod[]
  vyzaduje_foto: boolean
  vyzaduje_hodnotu: boolean
  nabizi_poznamku: boolean
  jednotka: string | null
  mez_min: number | null
  mez_max: number | null
}

export function prazdnyRadek(): RadekUkonu {
  return {
    nazev: '',
    popis: '',
    interval_typ: 'mesice',
    interval_hodnota: '1',
    // Výchozí je pevný kalendář, viz migrace 0009.
    interval_zaklad: 'od_planu',
    tolerance_dny: '0',
    profese_role_id: '',
    kontrolni_body: [],
    vyzaduje_foto: false,
    vyzaduje_hodnotu: false,
    nabizi_poznamku: false,
    jednotka: '',
    mez_min: '',
    mez_max: '',
  }
}

/**
 * Řádek, do kterého nikdo nic nenapsal. Editor jich pár drží prázdných dopředu,
 * ať se nemusí u každého úkonu klikat na „přidat" - zahodit je je vstřícnější
 * než na ně nadávat.
 */
function jeRadekPrazdny(radek: RadekUkonu): boolean {
  return (
    radek.nazev.trim() === '' &&
    radek.popis.trim() === '' &&
    radek.profese_role_id === '' &&
    ocistiBody(radek.kontrolni_body).length === 0 &&
    radek.jednotka.trim() === '' &&
    radek.mez_min.trim() === '' &&
    radek.mez_max.trim() === '' &&
    !radek.vyzaduje_foto &&
    !radek.vyzaduje_hodnotu &&
    !radek.nabizi_poznamku
  )
}

/** Desetinná čárka je česká klávesnice, tečka je JSON. Bereme obojí. */
function cislo(text: string): number | null {
  const cisty = text.trim().replace(',', '.')
  if (cisty === '') return null

  const hodnota = Number(cisty)
  return Number.isFinite(hodnota) ? hodnota : null
}

function celeCislo(text: string): number | null {
  const hodnota = cislo(text)
  return hodnota !== null && Number.isInteger(hodnota) ? hodnota : null
}

export function radkyNaUkony(radky: RadekUkonu[]): {
  ukony: UkonKUlozeni[]
  chyby: Record<number, string>
} {
  const ukony: UkonKUlozeni[] = []
  const chyby: Record<number, string> = {}

  radky.forEach((radek, index) => {
    if (jeRadekPrazdny(radek)) return

    const nazev = radek.nazev.trim()
    if (nazev === '') {
      chyby[index] = 'Zadejte název úkonu.'
      return
    }

    if (!jeTypIntervalu(radek.interval_typ)) {
      chyby[index] = 'Vyberte jednotku intervalu.'
      return
    }

    const hodnota = celeCislo(radek.interval_hodnota)
    if (hodnota === null || hodnota <= 0) {
      chyby[index] = 'Interval musí být celé číslo větší než nula.'
      return
    }

    if (!jeZakladIntervalu(radek.interval_zaklad)) {
      chyby[index] = 'Vyberte, od čeho se interval počítá.'
      return
    }

    const tolerance = celeCislo(radek.tolerance_dny === '' ? '0' : radek.tolerance_dny)
    if (tolerance === null || tolerance < 0) {
      chyby[index] = 'Tolerance musí být celé číslo, nejméně nula.'
      return
    }

    if (radek.profese_role_id === '') {
      chyby[index] = 'Vyberte profesi, která úkon provádí.'
      return
    }

    // Meze a jednotka mají smysl jen tam, kde se něco měří. Když garant měření
    // odškrtne, hodnoty se zahodí - vracet kvůli tomu chybu by bylo otravné.
    let jednotka: string | null = null
    let mezMin: number | null = null
    let mezMax: number | null = null

    if (radek.vyzaduje_hodnotu) {
      jednotka = radek.jednotka.trim()
      if (jednotka === '') {
        chyby[index] = 'U měřené hodnoty vyplňte jednotku - bez ní nejde vyhodnotit.'
        return
      }

      if (radek.mez_min.trim() !== '') {
        mezMin = cislo(radek.mez_min)
        if (mezMin === null) {
          chyby[index] = 'Dolní mez není číslo.'
          return
        }
      }

      if (radek.mez_max.trim() !== '') {
        mezMax = cislo(radek.mez_max)
        if (mezMax === null) {
          chyby[index] = 'Horní mez není číslo.'
          return
        }
      }

      if (mezMin !== null && mezMax !== null && mezMin > mezMax) {
        chyby[index] = 'Dolní mez je větší než horní.'
        return
      }
    }

    const popis = radek.popis.trim()

    ukony.push({
      // Pořadí se přiděluje až tady, po zahození prázdných řádků - jinak by
      // v číslování vznikly díry a checklist by na ně narazil.
      poradi: ukony.length + 1,
      nazev,
      popis: popis === '' ? null : popis,
      interval_typ: radek.interval_typ,
      interval_hodnota: hodnota,
      interval_zaklad: radek.interval_zaklad,
      tolerance_dny: tolerance,
      profese_role_id: radek.profese_role_id,
      kontrolni_body: ocistiBody(radek.kontrolni_body),
      vyzaduje_foto: radek.vyzaduje_foto,
      vyzaduje_hodnotu: radek.vyzaduje_hodnotu,
      nabizi_poznamku: radek.nabizi_poznamku,
      jednotka,
      mez_min: mezMin,
      mez_max: mezMax,
    })
  })

  return { ukony, chyby }
}
