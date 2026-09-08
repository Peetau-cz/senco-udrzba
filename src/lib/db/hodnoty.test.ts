import { Kysely, MssqlDialect } from 'kysely'
import * as Tarn from 'tarn'
import * as Tedious from 'tedious'
import { describe, expect, it } from 'vitest'
import { PrevodHodnot, den, okamzik } from './hodnoty'

/**
 * Kysely bez připojení - dotazy se jen překládají do SQL. Tovární funkce na
 * spojení se při překladu nikdy nezavolá.
 */
type Schema = {
  zakazka: { id: string; planovany_termin: string; dokonceno_at: string | null; stav: string }
}

const db = new Kysely<Schema>({
  dialect: new MssqlDialect({
    tarn: { ...Tarn, options: { min: 0, max: 1 } },
    tedious: {
      ...Tedious,
      connectionFactory: () => {
        throw new Error('test se nesmí připojovat')
      },
    },
  }),
  plugins: [new PrevodHodnot()],
})

describe('výrazy pro SQL Server', () => {
  it('den() čte sloupec typu date jako text YYYY-MM-DD', () => {
    const q = db
      .selectFrom('zakazka')
      .select(den('zakazka.planovany_termin').as('termin'))
      .compile()
    expect(q.sql).toBe(
      'select convert(char(10), "zakazka"."planovany_termin", 23) as "termin" from "zakazka"',
    )
    expect(q.parameters).toEqual([])
  })

  it('okamzik() váže čas jako ISO text, ne jako Date', () => {
    const q = db
      .updateTable('zakazka')
      .set({ dokonceno_at: okamzik('2026-09-08T10:00:00.000Z') })
      .where('id', '=', 'abc')
      .compile()
    expect(q.sql).toBe(
      'update "zakazka" set "dokonceno_at" = convert(datetime2(3), @1, 127) where "id" = @2',
    )
    expect(q.parameters).toEqual(['2026-09-08T10:00:00.000Z', 'abc'])
  })

  it('top() a offset/fetch se překládají po způsobu SQL Serveru', () => {
    expect(db.selectFrom('zakazka').select('id').top(5).compile().sql).toBe(
      'select top(5) "id" from "zakazka"',
    )
    const strankovani = db
      .selectFrom('zakazka')
      .select('id')
      .orderBy('id')
      .offset(20)
      .fetch(10)
      .compile()
    // Posun i počet jdou jako parametry - stejný plán dotazu pro každou stránku.
    expect(strankovani.sql).toBe(
      'select "id" from "zakazka" order by "id" offset @1 rows fetch next @2 rows only',
    )
    expect(strankovani.parameters).toEqual([20, 10])
  })
})

describe('PrevodHodnot', () => {
  const plugin = new PrevodHodnot()
  const preved = (radek: Record<string, unknown>) =>
    plugin
      .transformResult({
        result: { rows: [radek] },
        queryId: { queryId: 'test' },
      })
      .then((r) => r.rows[0])

  it('Date z ovladače se vrací jako ISO text v UTC', async () => {
    const radek = await preved({ dokonceno_at: new Date('2026-09-08T10:00:00.000Z') })
    expect(radek).toEqual({ dokonceno_at: '2026-09-08T10:00:00.000Z' })
  })

  it('známé JSON sloupce se vrací jako objekt', async () => {
    const radek = await preved({
      parametry: '{"otacky":1500}',
      kontrolni_body: '[{"nazev":"a","typ":"ano_ne"}]',
      stary_stav: null,
      popis: '{"neni":"json sloupec"}',
    })
    expect(radek).toEqual({
      parametry: { otacky: 1500 },
      kontrolni_body: [{ nazev: 'a', typ: 'ano_ne' }],
      stary_stav: null,
      popis: '{"neni":"json sloupec"}',
    })
  })

  it('poškozený JSON zůstane textem místo výjimky', async () => {
    const radek = await preved({ parametry: '{rozbity' })
    expect(radek).toEqual({ parametry: '{rozbity' })
  })

  it('ostatní hodnoty nechá být', async () => {
    const radek = await preved({ id: 'abc', pocet: 3, aktivni: true, nic: null })
    expect(radek).toEqual({ id: 'abc', pocet: 3, aktivni: true, nic: null })
  })
})
