import { describe, expect, it } from 'vitest'
import {
  dnesVPraze,
  popisTerminu,
  procentoHotovo,
  rozdilDnu,
  stavTerminu,
  zpozdeniDnu,
} from './terminy'

describe('dnešek v Praze', () => {
  it('vrací den v ISO tvaru', () => {
    expect(dnesVPraze(new Date('2026-08-19T10:00:00Z'))).toBe('2026-08-19')
  })

  it('bere pásmo závodu, ne UTC', () => {
    // 22:30 UTC je v Příbrami už 0:30 dalšího dne (letní čas, +2).
    expect(dnesVPraze(new Date('2026-08-19T22:30:00Z'))).toBe('2026-08-20')
  })
})

describe('rozdíl dnů', () => {
  it('počítá přes přechod na letní čas', () => {
    // V noci na 29. 3. 2026 se posouvají hodiny. Ve dnech to nesmí být znát.
    expect(rozdilDnu('2026-03-28', '2026-03-30')).toBe(2)
  })

  it('počítá přes konec měsíce i roku', () => {
    expect(rozdilDnu('2026-01-31', '2026-02-01')).toBe(1)
    expect(rozdilDnu('2026-12-31', '2027-01-01')).toBe(1)
  })

  it('je záporný směrem do minulosti', () => {
    expect(rozdilDnu('2026-09-10', '2026-09-01')).toBe(-9)
  })
})

describe('zpoždění', () => {
  it('je kladné u termínu v minulosti', () => {
    expect(zpozdeniDnu('2026-09-01', '2026-09-04')).toBe(3)
  })

  it('je null, dokud garant termín nezadal', () => {
    expect(zpozdeniDnu(null, '2026-09-04')).toBeNull()
  })
})

describe('stav termínu', () => {
  const dnes = '2026-09-10'

  it('rozlišuje chybějící termín od splatného', () => {
    expect(stavTerminu(null, dnes)).toBe('chybi')
    expect(stavTerminu('2026-09-10', dnes)).toBe('dnes')
  })

  it('po termínu je všechno starší než dnešek', () => {
    expect(stavTerminu('2026-09-09', dnes)).toBe('po_terminu')
    expect(stavTerminu('2026-01-01', dnes)).toBe('po_terminu')
  })

  it('okno „brzy" je týden a je uzavřené', () => {
    expect(stavTerminu('2026-09-17', dnes)).toBe('brzy')
    expect(stavTerminu('2026-09-18', dnes)).toBe('pozdeji')
  })
})

describe('popis termínu', () => {
  const dnes = '2026-09-10'

  it('používá slova, ne čísla, u sousedních dnů', () => {
    expect(popisTerminu('2026-09-10', dnes)).toBe('dnes')
    expect(popisTerminu('2026-09-11', dnes)).toBe('zítra')
    expect(popisTerminu('2026-09-09', dnes)).toBe('včera')
  })

  it('skloňuje dny podle počtu', () => {
    expect(popisTerminu('2026-09-13', dnes)).toBe('za 3 dny')
    expect(popisTerminu('2026-09-20', dnes)).toBe('za 10 dnů')
    expect(popisTerminu('2026-09-07', dnes)).toBe('po termínu o 3 dny')
    expect(popisTerminu('2026-08-31', dnes)).toBe('po termínu o 10 dnů')
  })

  it('řekne, když termín chybí', () => {
    expect(popisTerminu(null, dnes)).toBe('termín nezadán')
  })
})

describe('procento hotovo', () => {
  it('zaokrouhluje na celá procenta', () => {
    expect(procentoHotovo(3, 6)).toBe(50)
    expect(procentoHotovo(1, 3)).toBe(33)
  })

  it('prázdný checklist nedělí nulou', () => {
    expect(procentoHotovo(0, 0)).toBe(100)
  })
})
