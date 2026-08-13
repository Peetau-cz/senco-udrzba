import { describe, expect, it } from 'vitest'
import { cestaUmisteni } from './zobrazeni'

describe('cesta umístění', () => {
  it('spojí halu a provoz', () => {
    expect(cestaUmisteni({ nazev: 'CNC', kod: 'HALA_A_CNC', nadrazene: { nazev: 'Hala A', kod: 'HALA_A' } })).toBe(
      'Hala A / CNC',
    )
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
