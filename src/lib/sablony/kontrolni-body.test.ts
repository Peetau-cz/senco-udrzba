import { describe, expect, it } from 'vitest'
import { jeDruhBodu, ocistiBody, prectiBody, shrnBody } from './kontrolni-body'

describe('čtení kontrolních bodů', () => {
  it('přečte nový tvar s druhem', () => {
    expect(
      prectiBody([
        { nazev: '1000 ot.', typ: 'hodnota' },
        { nazev: 'Kryt dotažen', typ: 'ano_ne' },
      ]),
    ).toEqual([
      { nazev: '1000 ot.', typ: 'hodnota' },
      { nazev: 'Kryt dotažen', typ: 'ano_ne' },
    ])
  })

  it('snese i starý tvar z doby před migrací 0007', () => {
    expect(prectiBody(['1000 ot.', '3000 ot.'])).toEqual([
      { nazev: '1000 ot.', typ: 'hodnota' },
      { nazev: '3000 ot.', typ: 'hodnota' },
    ])
  })

  it('neznámý druh bere jako hodnotu, místo aby spadl', () => {
    expect(prectiBody([{ nazev: 'Cosi', typ: 'nesmysl' }])).toEqual([
      { nazev: 'Cosi', typ: 'hodnota' },
    ])
  })

  it('body bez názvu zahodí', () => {
    expect(prectiBody([{ nazev: '   ', typ: 'ano_ne' }, '', 42, null])).toEqual([])
  })

  it('z nepole udělá prázdný seznam', () => {
    expect(prectiBody(null)).toEqual([])
    expect(prectiBody({ nazev: 'a' })).toEqual([])
  })
})

describe('očištění před uložením', () => {
  it('ořízne mezery a zahodí prázdné', () => {
    expect(
      ocistiBody([
        { nazev: '  Kryt dotažen  ', typ: 'ano_ne' },
        { nazev: '  ', typ: 'hodnota' },
      ]),
    ).toEqual([{ nazev: 'Kryt dotažen', typ: 'ano_ne' }])
  })
})

describe('souhrn do přehledu', () => {
  it('otázky pozná otazníkem', () => {
    expect(
      shrnBody([
        { nazev: '1000 ot.', typ: 'hodnota' },
        { nazev: 'Kryt dotažen', typ: 'ano_ne' },
      ]),
    ).toBe('1000 ot. · Kryt dotažen?')
  })

  it('prázdný seznam je prázdný text', () => {
    expect(shrnBody([])).toBe('')
  })
})

describe('druh bodu', () => {
  it('pozná platné hodnoty', () => {
    expect(jeDruhBodu('ano_ne')).toBe(true)
    expect(jeDruhBodu('hodnota')).toBe(true)
    expect(jeDruhBodu('mozna')).toBe(false)
    expect(jeDruhBodu(undefined)).toBe(false)
  })
})
