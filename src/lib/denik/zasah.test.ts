import { describe, expect, it } from 'vitest'
import {
  cestaFotkyZasahu,
  formatDobu,
  kodDruhu,
  nyniProFormular,
  overDobu,
  overPopis,
  pragskyCasNaIso,
} from './zasah'

describe('overPopis', () => {
  it('prázdný popis nepustí - druh sám o sobě nic neřekne', () => {
    expect(overPopis('')).not.toBeNull()
    expect(overPopis('   ')).not.toBeNull()
  })

  it('běžný popis projde', () => {
    expect(overPopis('Vyměněna žárovka v panelu')).toBeNull()
  })

  it('příliš dlouhý popis nepustí', () => {
    expect(overPopis('a'.repeat(501))).not.toBeNull()
  })
})

describe('overDobu', () => {
  it('prázdné pole je platná odpověď - doba je volitelná', () => {
    expect(overDobu('')).toEqual({ hodnota: null })
  })

  it('celé minuty projdou', () => {
    expect(overDobu('15')).toEqual({ hodnota: 15 })
    expect(overDobu(' 90 ')).toEqual({ hodnota: 90 })
  })

  it('nula ani text neprojdou', () => {
    expect(overDobu('0')).toHaveProperty('chyba')
    expect(overDobu('chvilku')).toHaveProperty('chyba')
    expect(overDobu('1,5')).toHaveProperty('chyba')
  })

  it('nad 24 hodin je to oprava, ne zásah', () => {
    expect(overDobu('1441')).toHaveProperty('chyba')
    expect(overDobu('1440')).toEqual({ hodnota: 1440 })
  })
})

describe('formatDobu', () => {
  it('do hodiny ukazuje minuty', () => {
    expect(formatDobu(15)).toBe('15 min')
    expect(formatDobu(59)).toBe('59 min')
  })

  it('od hodiny ukazuje hodiny', () => {
    expect(formatDobu(60)).toBe('1 h')
    expect(formatDobu(90)).toBe('1 h 30 min')
    expect(formatDobu(125)).toBe('2 h 5 min')
  })

  it('nevyplněná doba je pomlčka, ne nula', () => {
    expect(formatDobu(null)).toBe('—')
    expect(formatDobu(undefined)).toBe('—')
  })
})

describe('cestaFotkyZasahu', () => {
  it('skládá cestu z id zápisu, náhodnosti a přípony podle typu', () => {
    expect(cestaFotkyZasahu('abc', 'image/jpeg', 'nahodne')).toBe('abc/nahodne.jpg')
    expect(cestaFotkyZasahu('abc', 'image/png', 'nahodne')).toBe('abc/nahodne.png')
  })

  it('neznámý typ nespadne, ale skončí jako bin - úložiště ho stejně odmítne', () => {
    expect(cestaFotkyZasahu('abc', 'application/zip', 'nahodne')).toBe('abc/nahodne.bin')
  })
})

describe('kodDruhu', () => {
  it('odvozuje kód z názvu bez diakritiky, malými písmeny', () => {
    expect(kodDruhu('Výměna filtru')).toBe('vymena_filtru')
    expect(kodDruhu('Kontrola tlaku  vzduchu')).toBe('kontrola_tlaku_vzduchu')
  })

  it('sedí se šesti druhy, které založila migrace 0020', () => {
    expect(kodDruhu('Výměna žárovky')).toBe('vymena_zarovky')
    expect(kodDruhu('Čištění')).toBe('cisteni')
  })

  it('při shodě přidá pořadové číslo, ať se kód nezdvojí', () => {
    expect(kodDruhu('Seřízení', ['serizeni'])).toBe('serizeni_2')
    expect(kodDruhu('Seřízení', ['serizeni', 'serizeni_2'])).toBe('serizeni_3')
  })

  it('název bez písmen a číslic kód nedá', () => {
    expect(kodDruhu('???')).toBe('')
  })
})

describe('pragskyCasNaIso', () => {
  // Tohle je jádro věci: server běží v UTC, prohlížeč posílá místní čas bez
  // pásma. Bez převodu by zásah zapsaný v 8:30 seděl v historii na 8:30 UTC,
  // tedy v létě o dvě hodiny dřív, než se doopravdy stal.
  it('zimní čas počítá s posunem +1', () => {
    expect(pragskyCasNaIso('2026-01-15T08:30')).toBe('2026-01-15T07:30:00.000Z')
  })

  it('letní čas počítá s posunem +2', () => {
    expect(pragskyCasNaIso('2026-07-15T08:30')).toBe('2026-07-15T06:30:00.000Z')
  })

  it('den přechodu na letní čas: půlnoc je pořád ještě v zimním pásmu', () => {
    // Přechod je poslední březnovou neděli ve 2:00 (2026: 29. 3.).
    expect(pragskyCasNaIso('2026-03-29T00:30')).toBe('2026-03-28T23:30:00.000Z')
    expect(pragskyCasNaIso('2026-03-29T12:00')).toBe('2026-03-29T10:00:00.000Z')
  })

  it('nesmyslný tvar vrací null, ne posunuté datum', () => {
    expect(pragskyCasNaIso('')).toBeNull()
    expect(pragskyCasNaIso('včera')).toBeNull()
    expect(pragskyCasNaIso('2026-07-15')).toBeNull()
  })
})

describe('nyniProFormular', () => {
  it('vrací pražský čas ve tvaru, kterému rozumí datetime-local', () => {
    expect(nyniProFormular(new Date('2026-07-15T06:30:00.000Z'))).toBe('2026-07-15T08:30')
    expect(nyniProFormular(new Date('2026-01-15T07:30:00.000Z'))).toBe('2026-01-15T08:30')
  })

  it('to, co vrátí, jde rovnou převést zpátky na týž okamžik', () => {
    const okamzik = new Date('2026-09-01T10:15:00.000Z')
    expect(pragskyCasNaIso(nyniProFormular(okamzik))).toBe(okamzik.toISOString())
  })
})
