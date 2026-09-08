import { describe, expect, it, vi } from 'vitest'
import { zahashujHeslo } from './heslo'
import { rozhodniPrihlaseni, vlastniHash, type ZaznamPrihlaseni } from './overovatel'

const OSOBA = '3f1c2a9e-7b4d-4c1e-9a2b-0d5e6f7a8b9c'

describe('rozhodniPrihlaseni', () => {
  it('správné heslo aktivní osoby vrátí její id', async () => {
    const zaznam: ZaznamPrihlaseni = {
      osobaId: OSOBA,
      hesloHash: await zahashujHeslo('Senco.Test123'),
      aktivni: true,
    }
    expect(await rozhodniPrihlaseni(zaznam, 'Senco.Test123')).toBe(OSOBA)
  })

  it('špatné heslo vrátí null', async () => {
    const zaznam: ZaznamPrihlaseni = {
      osobaId: OSOBA,
      hesloHash: await zahashujHeslo('Senco.Test123'),
      aktivni: true,
    }
    expect(await rozhodniPrihlaseni(zaznam, 'jine')).toBeNull()
  })

  it('vyřazená osoba se nepřihlásí ani se správným heslem', async () => {
    const zaznam: ZaznamPrihlaseni = {
      osobaId: OSOBA,
      hesloHash: await zahashujHeslo('Senco.Test123'),
      aktivni: false,
    }
    expect(await rozhodniPrihlaseni(zaznam, 'Senco.Test123')).toBeNull()
  })

  it('neznámý e-mail vrátí null, ale ověření proběhne (stejný čas jako u známého)', async () => {
    const zacatek = performance.now()
    expect(await rozhodniPrihlaseni(null, 'cokoli')).toBeNull()
    // scrypt s N=2^14 trvá desítky ms; okamžitý návrat by prozradil, že e-mail neexistuje.
    expect(performance.now() - zacatek).toBeGreaterThan(5)
  })
})

describe('vlastniHash', () => {
  it('normalizuje e-mail a předá ho načtení záznamu', async () => {
    const nacti = vi.fn(async (): Promise<ZaznamPrihlaseni | null> => ({
      osobaId: OSOBA,
      hesloHash: await zahashujHeslo('heslo'),
      aktivni: true,
    }))
    const overovatel = vlastniHash(nacti)
    expect(await overovatel.overHeslo('  Jan.Novak@SENCO.cz ', 'heslo')).toBe(OSOBA)
    expect(nacti).toHaveBeenCalledWith('jan.novak@senco.cz')
  })

  it('prázdný e-mail se do databáze vůbec neptá', async () => {
    const nacti = vi.fn(async () => null)
    expect(await vlastniHash(nacti).overHeslo('   ', 'heslo')).toBeNull()
    expect(nacti).not.toHaveBeenCalled()
  })
})
