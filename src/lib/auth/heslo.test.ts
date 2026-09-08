import { describe, expect, it } from 'vitest'
import { ATRAPA_HASHE, overHeslo, zahashujHeslo } from './heslo'

describe('zahashujHeslo', () => {
  it('vrací zápis scrypt s parametry, solí a hashem', async () => {
    const hash = await zahashujHeslo('Senco.Test123')
    const casti = hash.split('$')
    expect(casti).toHaveLength(6)
    expect(casti[0]).toBe('scrypt')
    expect(casti.slice(1, 4)).toEqual(['16384', '8', '1'])
    expect(casti[4]).toMatch(/^[A-Za-z0-9_-]{20,}$/)
    expect(casti[5]).toMatch(/^[A-Za-z0-9_-]{40,}$/)
    expect(hash.length).toBeLessThanOrEqual(300)
  })

  it('stejné heslo dostane pokaždé jinou sůl', async () => {
    const [a, b] = await Promise.all([zahashujHeslo('heslo'), zahashujHeslo('heslo')])
    expect(a).not.toBe(b)
  })
})

describe('overHeslo', () => {
  it('pozná správné heslo', async () => {
    const hash = await zahashujHeslo('Správné heslo s diakritikou ě')
    expect(await overHeslo('Správné heslo s diakritikou ě', hash)).toBe(true)
  })

  it('odmítne jiné heslo', async () => {
    const hash = await zahashujHeslo('heslo1')
    expect(await overHeslo('heslo2', hash)).toBe(false)
  })

  it('odmítne poškozený nebo cizí zápis místo výjimky', async () => {
    expect(await overHeslo('heslo', '')).toBe(false)
    expect(await overHeslo('heslo', 'bcrypt$neco')).toBe(false)
    expect(await overHeslo('heslo', 'scrypt$16384$8$1$sul')).toBe(false)
    expect(await overHeslo('heslo', 'scrypt$abc$8$1$sul$hash')).toBe(false)
  })

  it('atrapa pro neznámý e-mail je platný zápis, který nikdy nesedí', async () => {
    expect(ATRAPA_HASHE.startsWith('scrypt$')).toBe(true)
    expect(await overHeslo('cokoli', ATRAPA_HASHE)).toBe(false)
  })
})
