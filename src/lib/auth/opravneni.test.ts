import { describe, expect, it } from 'vitest'
import {
  KODY_ROLI,
  maPravo,
  maPristupKeVsemOblastem,
  muzeZapisovat,
  polozkyMenu,
  type KodRole,
} from './opravneni'

/**
 * Testy vycházejí přímo z matice oprávnění v docs/NAVRH.md kap. 3.1
 * a z požadavků zadání. Kdyby se matice změnila, tyto testy musí spadnout.
 */

describe('management je pouze pro čtení (zadání ř. 49)', () => {
  const management: KodRole[] = ['management']

  it('nesmí zapisovat do žádného modulu', () => {
    const moduly = [
      'zarizeni',
      'sablony',
      'plan',
      'provedeni',
      'denik',
      'uzivatele',
      'ciselniky',
    ] as const

    for (const modul of moduly) {
      expect(maPravo(management, modul, 'zapis'), `zápis do ${modul}`).toBe(false)
    }
  })

  it('nemá přístup k provedení údržby ani pro čtení', () => {
    expect(maPravo(management, 'provedeni', 'cteni')).toBe(false)
  })

  it('vidí dashboard, plnění matice a audit', () => {
    expect(maPravo(management, 'dashboard', 'cteni')).toBe(true)
    expect(maPravo(management, 'plneni', 'cteni')).toBe(true)
    expect(maPravo(management, 'audit', 'cteni')).toBe(true)
  })

  it('funkce muzeZapisovat je pro něj nepravdivá', () => {
    expect(muzeZapisovat(management)).toBe(false)
  })
})

describe('údržbář', () => {
  const udrzbar: KodRole[] = ['udrzbar']

  it('provádí údržbu a zapisuje do deníku', () => {
    expect(maPravo(udrzbar, 'provedeni', 'zapis')).toBe(true)
    expect(maPravo(udrzbar, 'denik', 'zapis')).toBe(true)
  })

  it('nesmí měnit šablony ani zařízení - jen je čte', () => {
    expect(maPravo(udrzbar, 'sablony', 'cteni')).toBe(true)
    expect(maPravo(udrzbar, 'sablony', 'zapis')).toBe(false)
    expect(maPravo(udrzbar, 'zarizeni', 'zapis')).toBe(false)
  })

  it('nevidí správu uživatelů ani audit', () => {
    expect(maPravo(udrzbar, 'uzivatele', 'cteni')).toBe(false)
    expect(maPravo(udrzbar, 'audit', 'cteni')).toBe(false)
  })
})

describe('garanti oblastí', () => {
  it('specialista CNC spravuje zařízení a šablony', () => {
    const role: KodRole[] = ['specialista_cnc']
    expect(maPravo(role, 'zarizeni', 'zapis')).toBe(true)
    expect(maPravo(role, 'sablony', 'zapis')).toBe(true)
    expect(maPravo(role, 'plan', 'zapis')).toBe(true)
  })

  it('nespravují uživatele ani číselníky', () => {
    for (const role of [
      ['specialista_cnc'],
      ['specialista_elektro'],
      ['vedouci_lakovny'],
      ['pracovnik_skladu'],
    ] satisfies KodRole[][]) {
      expect(maPravo(role, 'uzivatele', 'zapis'), role[0]).toBe(false)
      expect(maPravo(role, 'ciselniky', 'zapis'), role[0]).toBe(false)
    }
  })
})

describe('přístup k oblastem (zadání ř. 51-52)', () => {
  it('vedoucí údržby, management a administrátor vidí všechny oblasti', () => {
    expect(maPristupKeVsemOblastem(['vedouci_udrzby'])).toBe(true)
    expect(maPristupKeVsemOblastem(['management'])).toBe(true)
    expect(maPristupKeVsemOblastem(['administrator'])).toBe(true)
  })

  it('specialisté a údržbář ne', () => {
    expect(maPristupKeVsemOblastem(['specialista_cnc'])).toBe(false)
    expect(maPristupKeVsemOblastem(['specialista_elektro'])).toBe(false)
    expect(maPristupKeVsemOblastem(['udrzbar'])).toBe(false)
    expect(maPristupKeVsemOblastem(['vedouci_lakovny'])).toBe(false)
    expect(maPristupKeVsemOblastem(['pracovnik_skladu'])).toBe(false)
  })
})

describe('správa uživatelů', () => {
  it('je výhradně pro administrátora', () => {
    for (const kod of KODY_ROLI) {
      const ocekavano = kod === 'administrator'
      expect(maPravo([kod], 'uzivatele', 'zapis'), kod).toBe(ocekavano)
    }
  })

  it('číselníky spravuje administrátor a vedoucí údržby', () => {
    for (const kod of KODY_ROLI) {
      const ocekavano = kod === 'administrator' || kod === 'vedouci_udrzby'
      expect(maPravo([kod], 'ciselniky', 'zapis'), kod).toBe(ocekavano)
    }
  })
})

describe('menu', () => {
  it('každá role vidí alespoň dashboard', () => {
    for (const kod of KODY_ROLI) {
      const polozky = polozkyMenu([kod])
      expect(polozky.some((p) => p.modul === 'dashboard'), kod).toBe(true)
    }
  })

  it('management nevidí uživatele ani číselníky, ale vidí audit', () => {
    const moduly = polozkyMenu(['management']).map((p) => p.modul)
    expect(moduly).not.toContain('uzivatele')
    expect(moduly).not.toContain('ciselniky')
    expect(moduly).toContain('audit')
  })

  it('administrátor vidí víc položek než údržbář', () => {
    expect(polozkyMenu(['administrator']).length).toBeGreaterThan(polozkyMenu(['udrzbar']).length)
  })

  it('dashboard je vždy první položkou (zadání ř. 56)', () => {
    for (const kod of KODY_ROLI) {
      expect(polozkyMenu([kod])[0]?.href, kod).toBe('/')
    }
  })
})

describe('kombinace rolí', () => {
  it('práva se sčítají - údržbář se správcovstvím smí spravovat uživatele', () => {
    expect(maPravo(['udrzbar', 'administrator'], 'uzivatele', 'zapis')).toBe(true)
  })

  it('management s další rolí už zapisovat smí', () => {
    expect(muzeZapisovat(['management', 'udrzbar'])).toBe(true)
  })

  it('uživatel bez rolí nevidí nic a nesmí nic', () => {
    expect(polozkyMenu([])).toHaveLength(0)
    expect(muzeZapisovat([])).toBe(false)
    expect(maPravo([], 'dashboard', 'cteni')).toBe(false)
  })
})
