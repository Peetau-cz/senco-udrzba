import { describe, expect, it } from 'vitest'
import { nadpisZaznamu, popisHodnoty, popisSloupce, popisTabulky } from './popisky'

describe('názvy tabulek', () => {
  it('překládá auditované tabulky do češtiny', () => {
    expect(popisTabulky('zakazka')).toBe('Zakázka')
    expect(popisTabulky('provozni_denik')).toBe('Zápis v deníku')
    expect(popisTabulky('uzivatel_oblast')).toBe('Přiřazení oblasti')
  })

  it('neznámou tabulku vypíše technickým názvem', () => {
    // Měkký dopad: až přibude tabulka a na překlad se zapomene, audit
    // zestárne, ale neztratí pravdu a nic nespadne.
    expect(popisTabulky('nova_tabulka')).toBe('nova_tabulka')
  })
})

describe('názvy sloupců', () => {
  it('překládá běžné sloupce', () => {
    expect(popisSloupce('planovany_termin')).toBe('Plánovaný termín')
    expect(popisSloupce('inventarni_cislo')).toBe('Inventární číslo')
    expect(popisSloupce('prirazeno_uzivateli_id')).toBe('Přiřazeno')
  })

  it('neznámý sloupec vypíše technickým názvem', () => {
    expect(popisSloupce('nejaky_novy_sloupec')).toBe('nejaky_novy_sloupec')
  })

  it('u zamrazených hodnot ignoruje příponu _snapshot', () => {
    // Zakázka i její kroky si zamrazují hodnoty ze šablony. Pro čtenáře je to
    // pořád „Název", ne „Název snapshot".
    expect(popisSloupce('nazev_snapshot')).toBe('Název')
    expect(popisSloupce('jednotka_snapshot')).toBe('Jednotka')
  })

  it('neznámý sloupec s příponou _snapshot ji taky ztratí', () => {
    expect(popisSloupce('cosi_snapshot')).toBe('cosi')
  })
})

describe('hodnoty', () => {
  it('prázdná hodnota je pomlčka', () => {
    expect(popisHodnoty(null, 'poznamka')).toBe('—')
    expect(popisHodnoty(undefined, 'poznamka')).toBe('—')
  })

  it('pravda a nepravda se říkají česky', () => {
    expect(popisHodnoty(true, 'aktivni')).toBe('ano')
    expect(popisHodnoty(false, 'aktivni')).toBe('ne')
  })

  it('datum se vypisuje po česku', () => {
    expect(popisHodnoty('2026-08-27', 'planovany_termin')).toBe('27. 8. 2026')
  })

  it('časový údaj se vypisuje v pražském pásmu', () => {
    // Databáze drží čas v UTC, závod stojí v Příbrami.
    expect(popisHodnoty('2026-08-27T07:41:00Z', 'dokonceno_at')).toBe('27. 8. 2026 9:41')
  })

  it('stavy ze schématu se překládají', () => {
    expect(popisHodnoty('naplanovano', 'stav')).toBe('naplánováno')
    expect(popisHodnoty('nelze_provest', 'stav')).toBe('nelze provést')
    expect(popisHodnoty('v_provozu', 'stav')).toBe('v provozu')
    expect(popisHodnoty('garant', 'vztah')).toBe('garant')
  })

  it('neznámý stav zůstane, jak je', () => {
    expect(popisHodnoty('nejaky_novy_stav', 'stav')).toBe('nejaky_novy_stav')
  })

  it('čísla se vypisují beze změny', () => {
    expect(popisHodnoty(14, 'interval_hodnota')).toBe('14')
    expect(popisHodnoty(0, 'tolerance_dny_snapshot')).toBe('0')
  })
})

describe('klíče na jména', () => {
  const jmena = new Map([
    ['3f9a1c2d-0000-4000-8000-000000000001', 'Josef Svoboda'],
    ['3f9a1c2d-0000-4000-8000-000000000002', 'Soustruh SV-18'],
  ])

  it('klíč nahradí jménem, když je po ruce', () => {
    expect(popisHodnoty('3f9a1c2d-0000-4000-8000-000000000001', 'prirazeno_uzivateli_id', jmena)) //
      .toBe('Josef Svoboda')
  })

  it('neznámý klíč zkrátí, aby nerozbil řádek', () => {
    expect(popisHodnoty('7c1b0000-0000-4000-8000-00000000ffff', 'zarizeni_id', jmena)) //
      .toBe('7c1b0000…')
  })

  it('bez mapy jmen se klíč jen zkrátí', () => {
    expect(popisHodnoty('3f9a1c2d-0000-4000-8000-000000000002', 'zarizeni_id')) //
      .toBe('3f9a1c2d…')
  })
})

describe('nadpis záznamu', () => {
  const jmena = new Map([['3f9a1c2d-0000-4000-8000-000000000002', 'Soustruh SV-18 (1042)']])

  it('použije název, když ho záznam má', () => {
    expect(nadpisZaznamu({ nazev: 'Fréza FA-4' }, 'x1', jmena)).toBe('Fréza FA-4')
  })

  it('zamrazený název bere stejně', () => {
    expect(nadpisZaznamu({ nazev_snapshot: 'Kontrola oleje' }, 'x1', jmena)).toBe('Kontrola oleje')
  })

  it('u zakázky sáhne po stroji, protože vlastní název nemá', () => {
    // Klíč stroje je uložený přímo v auditovaném řádku, takže se jméno najde
    // bez dalšího dotazu do databáze.
    const nadpis = nadpisZaznamu(
      { zarizeni_id: '3f9a1c2d-0000-4000-8000-000000000002', stav: 'probiha' },
      'x1',
      jmena,
    )

    expect(nadpis).toBe('Soustruh SV-18 (1042)')
  })

  it('u profilu složí jméno a příjmení', () => {
    expect(nadpisZaznamu({ jmeno: 'Josef', prijmeni: 'Svoboda' }, 'x1', jmena)) //
      .toBe('Josef Svoboda')
  })

  it('když není podle čeho, ukáže zkrácený klíč', () => {
    expect(nadpisZaznamu({ poradi: 3 }, '7c1b0000-0000-4000-8000-00000000ffff', jmena)) //
      .toBe('7c1b0000…')
  })

  it('smazaný záznam se pozná ze starého stavu', () => {
    expect(nadpisZaznamu(null, 'x1')).toBe('x1')
  })
})

describe('strukturované hodnoty', () => {
  it('kontrolní body se vypíšou kompaktně', () => {
    expect(popisHodnoty([{ nazev: 'Hladina oleje' }], 'kontrolni_body')) //
      .toBe('[{"nazev":"Hladina oleje"}]')
  })

  it('parametry zařízení taky', () => {
    expect(popisHodnoty({ vykon: 5 }, 'parametry')).toBe('{"vykon":5}')
  })
})
