import { describe, expect, it } from 'vitest'
import { cestaUmisteni, idsUmisteniProFiltr } from './zobrazeni'

describe('cesta umístění', () => {
  it('spojí halu a provoz', () => {
    expect(
      cestaUmisteni({
        nazev: 'CNC',
        kod: 'HALA_A_CNC',
        nadrazene: { nazev: 'Hala A', kod: 'HALA_A' },
      }),
    ).toBe('Hala A / CNC')
  })

  it('halu samotnou nechá bez areálu', () => {
    expect(
      cestaUmisteni({
        nazev: 'Hala A',
        kod: 'HALA_A',
        nadrazene: { nazev: 'Areál SENCO Příbram', kod: 'AREAL' },
      }),
    ).toBe('Hala A')
  })

  it('kořen sám o sobě je pořád platné umístění', () => {
    expect(cestaUmisteni({ nazev: 'Areál SENCO Příbram', kod: 'AREAL', nadrazene: null })).toBe(
      'Areál SENCO Příbram',
    )
  })

  it('nevyplněné umístění nahradí pomlčkou', () => {
    expect(cestaUmisteni(null)).toBe('—')
    expect(cestaUmisteni(null, 'neurčeno')).toBe('neurčeno')
  })
})

describe('umístění pro filtr zařízení', () => {
  const nabidka = {
    haly: [
      {
        id: 'hala-a',
        kod: 'HALA_A',
        provozy: [
          { id: 'cnc', kod: 'HALA_A_CNC' },
          { id: 'lisovna', kod: 'HALA_A_LIS' },
        ],
      },
      { id: 'hala-b', kod: 'HALA_B', provozy: [{ id: 'svarovna', kod: 'HALA_B_SVAR' }] },
    ],
  }

  it('hala zabere i své provozy', () => {
    expect(idsUmisteniProFiltr(nabidka, 'HALA_A')).toEqual(['hala-a', 'cnc', 'lisovna'])
  })

  it('provoz zabere jen sám sebe', () => {
    expect(idsUmisteniProFiltr(nabidka, 'HALA_A_CNC')).toEqual(['cnc'])
  })

  it('najde provoz i v druhé hale', () => {
    expect(idsUmisteniProFiltr(nabidka, 'HALA_B_SVAR')).toEqual(['svarovna'])
  })

  it('bez volby se nefiltruje', () => {
    expect(idsUmisteniProFiltr(nabidka)).toBeUndefined()
    expect(idsUmisteniProFiltr(nabidka, '')).toBeUndefined()
  })

  it('neznámý kód z adresy se nefiltruje, nevrací prázdný výsledek', () => {
    expect(idsUmisteniProFiltr(nabidka, 'NEEXISTUJE')).toBeUndefined()
  })
})
