/**
 * Hodnoty na hranici mezi SQL Serverem a aplikací (docs/NASAZENI.md, pasti).
 *
 * Ovladač tedious vrací `date` i `datetime2` jako JS `Date` a JSON sloupce jako
 * text; aplikace ale všude počítá s textem `'YYYY-MM-DD'` pro dny, ISO textem
 * pro okamžiky a objekty pro JSON - tak to dřív dodával PostgREST. Tenhle
 * soubor ten rozdíl smazává na jednom místě:
 *
 * - `den()` čte sloupec typu `date` rovnou jako text, protože z `Date`
 *   o půlnoci UTC by se den nedal bezpečně odvodit;
 * - `okamzik()` váže čas jako ISO text - kdyby se předal `Date`, Kysely by ho
 *   poslal jako `datetime` s přesností 3 ms;
 * - plugin `PrevodHodnot` převede zbylé `Date` na ISO text a známé JSON
 *   sloupce na objekty.
 */

import type {
  KyselyPlugin,
  PluginTransformQueryArgs,
  PluginTransformResultArgs,
  QueryResult,
  RootOperationNode,
  UnknownRow,
} from 'kysely'
import { sql } from 'kysely'

/** Sloupec typu `date` jako text `YYYY-MM-DD` (styl 23 = ISO bez času). */
export function den(sloupec: string) {
  return sql<string>`convert(char(10), ${sql.ref(sloupec)}, 23)`
}

/** ISO čas jako parametr pro sloupec `datetime2` (styl 127 = ISO 8601 se Z). */
export function okamzik(iso: string) {
  return sql<string>`convert(datetime2(3), ${iso}, 127)`
}

/** Sloupce, které nesou JSON. Ostatní text se nechává být. */
export const JSON_SLOUPCE: ReadonlySet<string> = new Set([
  'schema_parametru',
  'parametry',
  'kontrolni_body',
  'stary_stav',
  'novy_stav',
])

function prevedHodnotu(klic: string, hodnota: unknown): unknown {
  if (hodnota instanceof Date) return hodnota.toISOString()
  if (typeof hodnota === 'string' && JSON_SLOUPCE.has(klic)) {
    try {
      return JSON.parse(hodnota)
    } catch {
      return hodnota
    }
  }
  return hodnota
}

function prevedRadek(radek: UnknownRow): UnknownRow {
  const vysledek: Record<string, unknown> = {}
  for (const [klic, hodnota] of Object.entries(radek)) {
    vysledek[klic] = prevedHodnotu(klic, hodnota)
  }
  return vysledek
}

export class PrevodHodnot implements KyselyPlugin {
  transformQuery(args: PluginTransformQueryArgs): RootOperationNode {
    return args.node
  }

  async transformResult(args: PluginTransformResultArgs): Promise<QueryResult<UnknownRow>> {
    return { ...args.result, rows: args.result.rows.map(prevedRadek) }
  }
}
