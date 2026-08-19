import { describe, expect, it } from 'vitest'
import {
  doplnOdpovedi,
  jeVMezich,
  pocetNevyplnenych,
  popisMezi,
  prectiCislo,
  prectiVyplneneBody,
} from './body'

const ZADANI = [
  { nazev: '1000 ot.', typ: 'hodnota' },
  { nazev: 'Kryt dotažen', typ: 'ano_ne' },
]

describe('čtení vyplněných bodů', () => {
  it('přečte zadání i odpovědi', () => {
    const body = prectiVyplneneBody([
      { nazev: '1000 ot.', typ: 'hodnota', hodnota: 4.2 },
      { nazev: 'Kryt dotažen', typ: 'ano_ne', ano: true },
    ])

    expect(body).toEqual([
      { nazev: '1000 ot.', typ: 'hodnota', hodnota: 4.2, ano: null },
      { nazev: 'Kryt dotažen', typ: 'ano_ne', hodnota: null, ano: true },
    ])
  })

  it('nevyplněný bod má odpověď null', () => {
    expect(prectiVyplneneBody(ZADANI)[0]?.hodnota).toBeNull()
    expect(prectiVyplneneBody(ZADANI)[1]?.ano).toBeNull()
  })

  it('odpověď špatného druhu ignoruje', () => {
    // Takový zápis by databáze odmítla, ale číst ho musíme umět.
    const body = prectiVyplneneBody([{ nazev: 'Kryt', typ: 'ano_ne', hodnota: 1 }])
    expect(body[0]).toEqual({ nazev: 'Kryt', typ: 'ano_ne', hodnota: null, ano: null })
  })

  it('snese nesmysl místo pole', () => {
    expect(prectiVyplneneBody(null)).toEqual([])
    expect(prectiVyplneneBody('ne')).toEqual([])
    expect(prectiVyplneneBody([{ typ: 'hodnota' }])).toEqual([])
  })
})

describe('doplnění odpovědí', () => {
  const puvodni = prectiVyplneneBody(ZADANI)

  it('zadání bere z původních bodů, ne z formuláře', () => {
    const ulozit = doplnOdpovedi(puvodni, [{ hodnota: '4,2' }, { ano: true }])

    expect(ulozit).toEqual([
      { nazev: '1000 ot.', typ: 'hodnota', hodnota: 4.2 },
      { nazev: 'Kryt dotažen', typ: 'ano_ne', ano: true },
    ])
  })

  it('nevyplněná odpověď se vypustí, ne uloží jako null', () => {
    const ulozit = doplnOdpovedi(puvodni, [{ hodnota: '' }, {}])

    expect(ulozit).toEqual([
      { nazev: '1000 ot.', typ: 'hodnota' },
      { nazev: 'Kryt dotažen', typ: 'ano_ne' },
    ])
  })

  it('odpověď „ne" se uloží, není to totéž jako nevyplněno', () => {
    const ulozit = doplnOdpovedi(puvodni, [{}, { ano: false }])
    expect(ulozit[1]).toEqual({ nazev: 'Kryt dotažen', typ: 'ano_ne', ano: false })
  })

  it('víc odpovědí než bodů nepřidá body navíc', () => {
    const ulozit = doplnOdpovedi(puvodni, [{ hodnota: '1' }, { ano: true }, { hodnota: '9' }])
    expect(ulozit).toHaveLength(2)
  })
})

describe('čtení čísla', () => {
  it('bere desetinnou čárku i tečku', () => {
    expect(prectiCislo('4,2')).toBe(4.2)
    expect(prectiCislo('4.2')).toBe(4.2)
  })

  it('prázdné a nesmyslné je null', () => {
    expect(prectiCislo('')).toBeNull()
    expect(prectiCislo('  ')).toBeNull()
    expect(prectiCislo('asi pět')).toBeNull()
    expect(prectiCislo(null)).toBeNull()
  })

  it('nulu bere jako hodnotu, ne jako prázdno', () => {
    expect(prectiCislo('0')).toBe(0)
  })
})

describe('počet nevyplněných', () => {
  it('počítá oba druhy bodů', () => {
    const body = prectiVyplneneBody([
      { nazev: 'a', typ: 'hodnota', hodnota: 1 },
      { nazev: 'b', typ: 'hodnota' },
      { nazev: 'c', typ: 'ano_ne', ano: false },
      { nazev: 'd', typ: 'ano_ne' },
    ])

    expect(pocetNevyplnenych(body)).toBe(2)
  })
})

describe('meze', () => {
  it('rozhoduje jen tam, kde má z čeho', () => {
    expect(jeVMezich(4.2, 3.5, 5)).toBe(true)
    expect(jeVMezich(3.0, 3.5, 5)).toBe(false)
    expect(jeVMezich(9.9, null, 5)).toBe(false)
    expect(jeVMezich(null, 3.5, 5)).toBeNull()
    expect(jeVMezich(4.2, null, null)).toBeNull()
  })

  it('krajní hodnota je uvnitř', () => {
    expect(jeVMezich(3.5, 3.5, 5)).toBe(true)
    expect(jeVMezich(5, 3.5, 5)).toBe(true)
  })

  it('popisuje meze česky a s čárkou', () => {
    expect(popisMezi(3.5, 5, 'l')).toBe('mez 3,5–5 l')
    expect(popisMezi(3.5, null, 'l')).toBe('min. 3,5 l')
    expect(popisMezi(null, 5, null)).toBe('max. 5')
    expect(popisMezi(null, null, 'l')).toBe('')
  })
})
