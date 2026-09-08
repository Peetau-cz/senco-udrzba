import { describe, expect, it } from 'vitest'
import { overZmenu, prelozChybu, rozpoznejChybu } from './chyby'

const chyba = (number: number, message: string) => Object.assign(new Error(message), { number })

describe('rozpoznejChybu', () => {
  it('duplicita z omezení UNIQUE (2627) i z unikátního indexu (2601) s názvem omezení', () => {
    const a = rozpoznejChybu(
      chyba(
        2627,
        "Violation of UNIQUE KEY constraint 'profil_osobni_cislo_key'. Cannot insert duplicate key in object 'dbo.profil'. The duplicate key value is (1234).",
      ),
    )
    expect(a).toMatchObject({ druh: 'duplicita', cislo: 2627, omezeni: 'profil_osobni_cislo_key' })

    const b = rozpoznejChybu(
      chyba(
        2601,
        "Cannot insert duplicate key row in object 'dbo.profil' with unique index 'profil_email_idx'. The duplicate key value is (a@b.cz).",
      ),
    )
    expect(b).toMatchObject({ druh: 'duplicita', cislo: 2601, omezeni: 'profil_email_idx' })
  })

  it('547 rozliší cizí klíč a CHECK podle názvu omezení, ne podle jazyka hlášky', () => {
    const fk = rozpoznejChybu(
      chyba(
        547,
        'The DELETE statement conflicted with the REFERENCE constraint "fk_zarizeni_typ". The conflict occurred in database "Udrzba", table "dbo.zarizeni", column \'typ_zarizeni_id\'.',
      ),
    )
    expect(fk).toMatchObject({ druh: 'cizi_klic', omezeni: 'fk_zarizeni_typ' })

    const ck = rozpoznejChybu(
      chyba(
        547,
        'Příkaz INSERT je v konfliktu s omezením CHECK "ck_zarizeni_stav". Ke konfliktu došlo v databázi "Udrzba", tabulka "dbo.zarizeni".',
      ),
    )
    expect(ck).toMatchObject({ druh: 'kontrola', omezeni: 'ck_zarizeni_stav' })
  })

  it('chybějící právo: 229, 230 i blokovaný zápis RLS 33504', () => {
    expect(
      rozpoznejChybu(chyba(229, "The INSERT permission was denied on the object 'audit_log'")).druh,
    ).toBe('opravneni')
    expect(rozpoznejChybu(chyba(230, 'The UPDATE permission was denied on the column')).druh).toBe(
      'opravneni',
    )
    expect(
      rozpoznejChybu(
        chyba(
          33504,
          'The attempted operation failed because the target object has a block predicate',
        ),
      ).druh,
    ).toBe('opravneni')
  })

  it('vlastní THROW podle číselné řady', () => {
    expect(
      rozpoznejChybu(chyba(50001, 'Zakázku smí dokončit jen technik z její oblasti.')),
    ).toMatchObject({
      druh: 'opravneni',
      zprava: 'Zakázku smí dokončit jen technik z její oblasti.',
    })
    expect(rozpoznejChybu(chyba(50120, 'Uzavřená zakázka se nemění.')).druh).toBe('pravidlo')
    expect(rozpoznejChybu(chyba(50201, 'Verze šablony neexistuje.')).druh).toBe('nenalezeno')
    expect(rozpoznejChybu(chyba(50301, 'Neplatný interval.')).druh).toBe('neplatny_argument')
  })

  it('příliš dlouhý text (2628) a všechno ostatní', () => {
    expect(rozpoznejChybu(chyba(2628, 'String or binary data would be truncated')).druh).toBe(
      'prilis_dlouhe',
    )
    expect(rozpoznejChybu(chyba(1205, 'deadlock')).druh).toBe('jina')
    expect(rozpoznejChybu(new Error('spadlo spojení'))).toMatchObject({ druh: 'jina', cislo: null })
    expect(rozpoznejChybu('řetězec')).toMatchObject({ druh: 'jina', zprava: 'řetězec' })
  })
})

describe('prelozChybu', () => {
  const texty = {
    duplicita: {
      profil_email_idx: 'Tenhle e-mail už někdo má.',
      vychozi: 'Takový záznam už existuje.',
    },
    cizi_klic: 'Záznam se používá jinde, nejde smazat.',
    opravneni: 'Na tuhle akci nemáte oprávnění.',
  }

  it('duplicita podle názvu omezení, jinak výchozí věta', () => {
    expect(
      prelozChybu(chyba(2601, "with unique index 'profil_email_idx'. The duplicate"), texty),
    ).toBe('Tenhle e-mail už někdo má.')
    expect(prelozChybu(chyba(2627, "constraint 'jine_omezeni'. Cannot insert"), texty)).toBe(
      'Takový záznam už existuje.',
    )
  })

  it('pravidlo z triggeru jde uživateli doslova, česky', () => {
    expect(prelozChybu(chyba(50131, 'Zápis v deníku se nemaže.'), texty)).toBe(
      'Zápis v deníku se nemaže.',
    )
  })

  it('oprávnění: vlastní věta formuláře, nebo text z THROW, nebo obecná věta', () => {
    expect(prelozChybu(chyba(229, 'permission was denied'), texty)).toBe(
      'Na tuhle akci nemáte oprávnění.',
    )
    expect(prelozChybu(chyba(50002, 'Plánovat smí jen garant oblasti.'), {})).toBe(
      'Plánovat smí jen garant oblasti.',
    )
    expect(prelozChybu(chyba(33504, 'block predicate'), {})).toBe('Na tuhle akci nemáte oprávnění.')
  })

  it('neznámá chyba dostane obecnou větu s textem', () => {
    expect(prelozChybu(new Error('spadlo spojení'), texty)).toBe(
      'Uložení se nepovedlo: spadlo spojení',
    )
  })
})

describe('overZmenu', () => {
  it('nula změněných řádků = nemáte oprávnění (RLS filtruje, nehlásí)', () => {
    expect(overZmenu(0n, 'Zařízení nejde upravit.')).toBe('Zařízení nejde upravit.')
    expect(overZmenu(1n, 'Zařízení nejde upravit.')).toBeNull()
    expect(overZmenu(undefined, 'Zařízení nejde upravit.')).toBe('Zařízení nejde upravit.')
  })
})
