import { describe, expect, it } from 'vitest'
import { rozsahDnu } from './filtr'

describe('rozsah dnů pro filtr auditu', () => {
  it('bez zadání nevrací žádnou mez', () => {
    expect(rozsahDnu()).toEqual({})
    expect(rozsahDnu('', '')).toEqual({})
  })

  it('od začíná půlnocí pražského dne', () => {
    // V srpnu je Praha dvě hodiny před UTC, půlnoc tedy padne na předchozí den.
    expect(rozsahDnu('2026-08-27').odIso).toBe('2026-08-26T22:00:00.000Z')
  })

  it('v zimě je posun o hodinu menší', () => {
    expect(rozsahDnu('2026-01-05').odIso).toBe('2026-01-04T23:00:00.000Z')
  })

  it('do zahrnuje celý zvolený den', () => {
    // Horní mez je začátek NÁSLEDUJÍCÍHO dne a porovnává se ostře, jinak by
    // ze zvoleného dne vypadlo všechno po půlnoci.
    expect(rozsahDnu(undefined, '2026-08-27').doIso).toBe('2026-08-27T22:00:00.000Z')
  })

  it('rozsah přes přechod na letní čas má každou mez ve svém pásmu', () => {
    // Letní čas začíná 29. 3. 2026. Dolní mez je ještě zimní (+1), horní už
    // letní (+2) - posun se počítá pro každý okamžik zvlášť, ne jednou pro
    // celý rozsah.
    const rozsah = rozsahDnu('2026-03-28', '2026-03-29')

    expect(rozsah.odIso).toBe('2026-03-27T23:00:00.000Z')
    expect(rozsah.doIso).toBe('2026-03-29T22:00:00.000Z')
  })

  it('přelom měsíce i roku posune datum správně', () => {
    expect(rozsahDnu(undefined, '2026-08-31').doIso).toBe('2026-08-31T22:00:00.000Z')
    expect(rozsahDnu(undefined, '2026-12-31').doIso).toBe('2026-12-31T23:00:00.000Z')
  })

  it('nesmyslné datum se zahodí, místo aby prošlo dál', () => {
    expect(rozsahDnu('27.8.2026')).toEqual({})
    expect(rozsahDnu('2026-13-45')).toEqual({})
  })
})
