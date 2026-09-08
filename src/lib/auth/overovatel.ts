/**
 * Ověření hesla při přihlášení - rozhraní, za kterým se dá vyměnit způsob.
 *
 * Dnes: vlastní hash v tabulce `prihlaseni` (docs/NASAZENI.md). Až IT řekne,
 * jak ověřuje heslo ZAKMAT, přibude druhá implementace téhož rozhraní a
 * `login/actions.ts` se nemění. Databázi tenhle soubor nezná - záznam mu
 * dodá volající, takže se dá testovat bez ní.
 */

import { ATRAPA_HASHE, overHeslo } from './heslo'

export type ZaznamPrihlaseni = {
  osobaId: string
  hesloHash: string
  aktivni: boolean
}

export type Overovatel = {
  /** Vrátí id osoby, nebo null. Proč to nevyšlo, se neříká - záměrně. */
  overHeslo(email: string, heslo: string): Promise<string | null>
}

/**
 * Rozhodne o přihlášení nad načteným záznamem.
 *
 * U neznámého e-mailu i u vyřazené osoby se hash přesto spočítá, aby odpověď
 * trvala stejně dlouho jako u platného účtu. Jinak by šlo z rychlosti
 * odpovědi poznat, kdo ve firmě účet má.
 */
export async function rozhodniPrihlaseni(
  zaznam: ZaznamPrihlaseni | null,
  heslo: string,
): Promise<string | null> {
  if (!zaznam) {
    await overHeslo(heslo, ATRAPA_HASHE)
    return null
  }
  const sedi = await overHeslo(heslo, zaznam.hesloHash)
  return sedi && zaznam.aktivni ? zaznam.osobaId : null
}

/** E-mail bez mezer a malými písmeny; databáze má index nad stejným tvarem. */
export function normalizujEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function vlastniHash(
  nactiZaznam: (email: string) => Promise<ZaznamPrihlaseni | null>,
): Overovatel {
  return {
    async overHeslo(email, heslo) {
      const normalizovany = normalizujEmail(email)
      if (!normalizovany) return null
      return rozhodniPrihlaseni(await nactiZaznam(normalizovany), heslo)
    },
  }
}
