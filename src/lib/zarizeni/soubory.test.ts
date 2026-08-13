import { describe, expect, it } from 'vitest'
import {
  MAX_VELIKOST_B,
  cestaSouboru,
  formatVelikost,
  jeDruhSouboru,
  jeObrazek,
  overSoubor,
  zkratNazev,
} from './soubory'

describe('ověření souboru', () => {
  const platny = { nazev: 'navod.pdf', velikost: 1024, mime: 'application/pdf' }

  it('platný soubor projde', () => {
    expect(overSoubor(platny)).toBeNull()
  })

  it('odmítne prázdný soubor', () => {
    expect(overSoubor({ ...platny, velikost: 0 })).toBe('Soubor je prázdný.')
  })

  it('odmítne soubor přes limit a uvede obě velikosti', () => {
    const hlaska = overSoubor({ ...platny, velikost: MAX_VELIKOST_B + 1 })
    expect(hlaska).toContain('10 MB')
    expect(hlaska).toContain('větší')
  })

  it('soubor přesně na limitu ještě projde', () => {
    expect(overSoubor({ ...platny, velikost: MAX_VELIKOST_B })).toBeNull()
  })

  it('odmítne nepovolený typ', () => {
    expect(overSoubor({ ...platny, mime: 'application/zip' })).toContain('Přijímáme jen')
    expect(overSoubor({ ...platny, mime: 'image/svg+xml' })).toContain('Přijímáme jen')
  })

  it('přijme všechny povolené obrázky', () => {
    for (const mime of ['image/jpeg', 'image/png', 'image/webp']) {
      expect(overSoubor({ ...platny, mime }), mime).toBeNull()
    }
  })
})

describe('cesta v úložišti', () => {
  it('začíná identifikátorem zařízení - podle něj se řídí oprávnění', () => {
    const cesta = cestaSouboru('11111111-2222-3333-4444-555555555555', 'application/pdf', 'abc')
    expect(cesta).toBe('11111111-2222-3333-4444-555555555555/abc.pdf')
  })

  it('nepřebírá nic z původního názvu souboru', () => {
    const cesta = cestaSouboru('id-stroje', 'image/jpeg', 'nahodne')
    expect(cesta).toBe('id-stroje/nahodne.jpg')
    expect(cesta).not.toContain(' ')
  })
})

describe('zkrácení názvu', () => {
  it('krátký název nechá být', () => {
    expect(zkratNazev('Návod k obsluze.pdf')).toBe('Návod k obsluze.pdf')
  })

  it('dlouhý zkrátí, ale příponu zachová', () => {
    const dlouhy = 'a'.repeat(200) + '.pdf'
    const zkraceny = zkratNazev(dlouhy)
    expect(zkraceny.length).toBeLessThanOrEqual(80)
    expect(zkraceny.endsWith('.pdf')).toBe(true)
  })

  it('vyhodí zalomení řádků', () => {
    expect(zkratNazev('navod\nk\tobsluze.pdf')).toBe('navod k obsluze.pdf')
  })
})

describe('formátování velikosti', () => {
  it('používá české desetinné čárky a rozumné jednotky', () => {
    expect(formatVelikost(512)).toBe('512 B')
    expect(formatVelikost(1536)).toBe('1,5 kB')
    expect(formatVelikost(10 * 1024 * 1024)).toBe('10 MB')
    expect(formatVelikost(null)).toBe('—')
  })
})

describe('drobnosti', () => {
  it('pozná známé druhy souboru', () => {
    expect(jeDruhSouboru('foto')).toBe(true)
    expect(jeDruhSouboru('navod')).toBe(true)
    expect(jeDruhSouboru('vymysl')).toBe(false)
  })

  it('pozná obrázek podle MIME', () => {
    expect(jeObrazek('image/png')).toBe(true)
    expect(jeObrazek('application/pdf')).toBe(false)
    expect(jeObrazek(null)).toBe(false)
  })
})
