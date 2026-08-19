import { describe, expect, it } from 'vitest'
import { nabidkaObdobi, popisObdobi, procentoPlneni, souhrnPlneni, zacatekMesice } from './vypocet'

describe('období', () => {
  it('sráží datum na první den měsíce', () => {
    expect(zacatekMesice('2026-08-19')).toBe('2026-08-01')
    expect(zacatekMesice('2026-01-31')).toBe('2026-01-01')
  })

  it('popisuje měsíc česky', () => {
    expect(popisObdobi('2026-08-01')).toBe('srpen 2026')
    expect(popisObdobi('2026-12-01')).toBe('prosinec 2026')
  })

  it('nabídka začíná probíhajícím měsícem a jde zpět', () => {
    const nabidka = nabidkaObdobi('2026-08-19', 3)
    expect(nabidka).toEqual(['2026-08-01', '2026-07-01', '2026-06-01'])
  })

  it('nabídka přechází přes konec roku', () => {
    expect(nabidkaObdobi('2026-01-15', 3)).toEqual(['2026-01-01', '2025-12-01', '2025-11-01'])
  })
})

describe('procento plnění', () => {
  it('zaokrouhluje na celá procenta', () => {
    expect(procentoPlneni(124, 126)).toBe(98)
    expect(procentoPlneni(1, 3)).toBe(33)
  })

  it('měsíc bez splatného úkonu je sto procent, ne nula', () => {
    // Jinak by nová oblast bez naplánované údržby vypadala jako nejhorší
    // v podniku, přestože nezanedbala nic.
    expect(procentoPlneni(0, 0)).toBe(100)
  })

  it('nic splněného z něčeho splatného je nula', () => {
    expect(procentoPlneni(0, 5)).toBe(0)
  })
})

describe('souhrn přes oblasti', () => {
  it('sečte všechny sloupce', () => {
    const souhrn = souhrnPlneni([
      { oblastId: 'a', oblastNazev: 'CNC', celkem: 10, splneno: 9, poTerminu: 1, neprovedeno: 2 },
      { oblastId: 'b', oblastNazev: 'VZV', celkem: 5, splneno: 5, poTerminu: 0, neprovedeno: 0 },
    ])

    expect(souhrn).toEqual({ celkem: 15, splneno: 14, poTerminu: 1, neprovedeno: 2 })
  })

  it('prázdný seznam dá samé nuly', () => {
    expect(souhrnPlneni([])).toEqual({ celkem: 0, splneno: 0, poTerminu: 0, neprovedeno: 0 })
  })
})
