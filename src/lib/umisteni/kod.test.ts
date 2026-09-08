import { describe, expect, it } from 'vitest'
import { kodUmisteni } from './kod'

describe('odvození kódu z názvu', () => {
  it('shodí diakritiku a mezery', () => {
    expect(kodUmisteni('Hala 2')).toBe('HALA_2')
    expect(kodUmisteni('Lakovna')).toBe('LAKOVNA')
    expect(kodUmisteni('Údržbářská dílna')).toBe('UDRZBARSKA_DILNA')
  })

  it('předsazuje kód nadřazeného umístění', () => {
    expect(kodUmisteni('Linka B', 'HALA_2')).toBe('HALA_2_LINKA_B')
  })

  it('stejný název ve dvou halách dá různé kódy', () => {
    expect(kodUmisteni('Linka B', 'HALA_1')).not.toBe(kodUmisteni('Linka B', 'HALA_2'))
  })

  it('z názvu bez písmen a číslic nevymýšlí nic', () => {
    expect(kodUmisteni('  ')).toBe('')
    expect(kodUmisteni('---')).toBe('')
  })

  it('kód nikdy nekončí podtržítkem, ani po zkrácení', () => {
    const dlouhy = kodUmisteni('Hala s velmi dlouhým názvem provozu a linky', 'HALA_1')
    expect(dlouhy.length).toBeLessThanOrEqual(40)
    expect(dlouhy.endsWith('_')).toBe(false)
  })
})
