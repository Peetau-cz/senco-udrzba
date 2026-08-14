import { describe, expect, it } from 'vitest'
import { prazdnyRadek, radkyNaUkony, type RadekUkonu } from './matice'

const PROFESE = '11111111-1111-4111-8111-111111111111'

function radek(zmeny: Partial<RadekUkonu> = {}): RadekUkonu {
  return { ...prazdnyRadek(), nazev: 'Kontrola oleje', profese_role_id: PROFESE, ...zmeny }
}

describe('řádky matice na úkony', () => {
  it('převede vyplněný řádek', () => {
    const { ukony, chyby } = radkyNaUkony([radek({ interval_hodnota: '3' })])

    expect(chyby).toEqual({})
    expect(ukony).toHaveLength(1)
    expect(ukony[0]).toMatchObject({
      poradi: 1,
      nazev: 'Kontrola oleje',
      interval_typ: 'mesice',
      interval_hodnota: 3,
      interval_zaklad: 'od_planu',
      tolerance_dny: 0,
      popis: null,
      jednotka: null,
    })
  })

  it('prázdné řádky zahodí a nepřeruší číslování', () => {
    const { ukony, chyby } = radkyNaUkony([
      radek({ nazev: 'První' }),
      prazdnyRadek(),
      radek({ nazev: 'Druhý' }),
    ])

    expect(chyby).toEqual({})
    expect(ukony.map((u) => [u.poradi, u.nazev])).toEqual([
      [1, 'První'],
      [2, 'Druhý'],
    ])
  })

  it('chybu hlásí u konkrétního řádku', () => {
    const { ukony, chyby } = radkyNaUkony([
      radek({ nazev: 'Dobrý' }),
      radek({ nazev: 'Špatný', interval_hodnota: '0' }),
    ])

    expect(ukony).toHaveLength(1)
    expect(chyby[1]).toContain('větší než nula')
  })

  it('úkon bez profese neprojde', () => {
    const { chyby } = radkyNaUkony([radek({ profese_role_id: '' })])
    expect(chyby[0]).toContain('profesi')
  })
})

describe('měřené hodnoty', () => {
  it('měření bez jednotky neprojde', () => {
    const { chyby } = radkyNaUkony([radek({ vyzaduje_hodnotu: true, jednotka: '' })])
    expect(chyby[0]).toContain('jednotku')
  })

  it('bere desetinnou čárku i tečku', () => {
    const { ukony, chyby } = radkyNaUkony([
      radek({ vyzaduje_hodnotu: true, jednotka: 'mm', mez_min: '0,05', mez_max: '0.1' }),
    ])

    expect(chyby).toEqual({})
    expect(ukony[0]).toMatchObject({ mez_min: 0.05, mez_max: 0.1 })
  })

  it('prohozené meze neprojdou', () => {
    const { chyby } = radkyNaUkony([
      radek({ vyzaduje_hodnotu: true, jednotka: 'mm', mez_min: '5', mez_max: '1' }),
    ])

    expect(chyby[0]).toContain('větší než horní')
  })

  it('bez měření se jednotka a meze zahodí, ne odmítnou', () => {
    const { ukony, chyby } = radkyNaUkony([
      radek({ vyzaduje_hodnotu: false, jednotka: 'mm', mez_min: '1', mez_max: '5' }),
    ])

    expect(chyby).toEqual({})
    expect(ukony[0]).toMatchObject({ jednotka: null, mez_min: null, mez_max: null })
  })
})

describe('kontrolní body v úkonu', () => {
  it('projdou i s druhem zápisu', () => {
    const { ukony, chyby } = radkyNaUkony([
      radek({
        kontrolni_body: [
          { nazev: '1000 ot.', typ: 'hodnota' },
          { nazev: 'Kryt dotažen', typ: 'ano_ne' },
        ],
      }),
    ])

    expect(chyby).toEqual({})
    expect(ukony[0]).toMatchObject({
      kontrolni_body: [
        { nazev: '1000 ot.', typ: 'hodnota' },
        { nazev: 'Kryt dotažen', typ: 'ano_ne' },
      ],
    })
  })

  it('bod bez názvu se zahodí, ne odmítne', () => {
    const { ukony, chyby } = radkyNaUkony([
      radek({
        kontrolni_body: [
          { nazev: '  ', typ: 'ano_ne' },
          { nazev: 'Kryt dotažen', typ: 'ano_ne' },
        ],
      }),
    ])

    expect(chyby).toEqual({})
    expect(ukony[0]?.kontrolni_body).toHaveLength(1)
  })

  it('řádek, kde je jen kontrolní bod, se nepovažuje za prázdný', () => {
    const { chyby } = radkyNaUkony([
      { ...prazdnyRadek(), kontrolni_body: [{ nazev: 'Kryt dotažen', typ: 'ano_ne' }] },
    ])

    // Chybí název úkonu - to je chyba, ne důvod řádek tiše zahodit.
    expect(chyby[0]).toContain('název')
  })
})
