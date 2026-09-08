/**
 * Aplikace migrací z `mssql/migrace/*.sql`.
 *
 * Soubory se pouštějí v pořadí názvu (`0001_…`, `0002_…`). Co už bylo
 * aplikované, je v tabulce `dbo._migrace` i s otiskem obsahu - změněný soubor
 * po aplikaci je chyba, ne tichá shoda, protože databáze by pak neodpovídala
 * repozitáři. Soubory začínající podtržítkem jsou šablony a nepouštějí se.
 *
 * Jeden soubor = jedna transakce: buď projde celý, nebo nic. Uvnitř se dávky
 * dělí na `GO` (viz davky.mjs). `ALTER DATABASE` a další věci, které v
 * transakci běžet nesmí, patří do `mssql-init.mjs`, ne do migrací.
 */

import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { rozdelNaDavkyPodrobne } from './davky.mjs'
import { popisChyby, spustDavku, sql } from './mssql.mjs'

export const ADRESAR_MIGRACI = path.resolve('mssql', 'migrace')

const ZALOZENI_TABULKY = `
if object_id(N'dbo._migrace', N'U') is null
  create table dbo._migrace (
    nazev nvarchar(200) not null primary key,
    aplikovano_at datetime2(3) not null constraint df_migrace_aplikovano default sysutcdatetime(),
    sha256 char(64) not null
  );`

/** Otisk obsahu nezávislý na koncích řádků, aby ho git autocrlf neměnil. */
export function otiskObsahu(text) {
  return createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex')
}

export async function nactiSouboryMigraci(adresar = ADRESAR_MIGRACI) {
  const nazvy = (await readdir(adresar))
    .filter((n) => n.toLowerCase().endsWith('.sql') && !n.startsWith('_'))
    .sort()
  return Promise.all(
    nazvy.map(async (nazev) => {
      const text = await readFile(path.join(adresar, nazev), 'utf8')
      return { nazev, text, otisk: otiskObsahu(text) }
    }),
  )
}

/**
 * @param {sql.ConnectionPool} pool - připojení jako vlastník databáze
 * @param {{ jenKontrola?: boolean, log?: (radek: string) => void }} [volby]
 * @returns {Promise<{ aplikovane: string[], preskocene: string[], zmenene: string[] }>}
 */
export async function aplikujMigrace(pool, volby = {}) {
  const log = volby.log ?? console.log
  await spustDavku(pool, ZALOZENI_TABULKY)

  const hotove = new Map(
    (await pool.request().query('select nazev, sha256 from dbo._migrace')).recordset.map((r) => [
      r.nazev,
      r.sha256,
    ]),
  )

  const vysledek = { aplikovane: [], preskocene: [], zmenene: [] }

  for (const soubor of await nactiSouboryMigraci()) {
    const ulozenyOtisk = hotove.get(soubor.nazev)

    if (ulozenyOtisk) {
      if (ulozenyOtisk !== soubor.otisk) {
        vysledek.zmenene.push(soubor.nazev)
        log(`! ${soubor.nazev} - soubor se po aplikaci změnil (otisk nesedí)`)
      } else {
        vysledek.preskocene.push(soubor.nazev)
      }
      continue
    }

    if (volby.jenKontrola) {
      log(`  ${soubor.nazev} - čeká na aplikaci`)
      vysledek.aplikovane.push(soubor.nazev)
      continue
    }

    await aplikujSoubor(pool, soubor, log)
    vysledek.aplikovane.push(soubor.nazev)
  }

  if (vysledek.zmenene.length) {
    throw new Error(
      `Migrace už aplikované se změnily: ${vysledek.zmenene.join(', ')}. ` +
        'Aplikovaný soubor se nemění - změna patří do nové migrace.',
    )
  }

  return vysledek
}

async function aplikujSoubor(pool, soubor, log) {
  const davky = rozdelNaDavkyPodrobne(soubor.text)
  const transakce = new sql.Transaction(pool)
  await transakce.begin()

  try {
    await spustDavku(transakce, 'set xact_abort on;')
    for (const davka of davky) {
      try {
        await spustDavku(transakce, davka.text, (hlaska) => log(`    ${hlaska}`))
      } catch (chyba) {
        throw new Error(`${soubor.nazev}: ${popisChyby(chyba, davka.radek)}`)
      }
    }
    const zapis = new sql.Request(transakce)
    zapis.input('nazev', sql.NVarChar(200), soubor.nazev)
    zapis.input('sha256', sql.Char(64), soubor.otisk)
    await zapis.query('insert into dbo._migrace (nazev, sha256) values (@nazev, @sha256)')
    await transakce.commit()
    log(`+ ${soubor.nazev} (${davky.length} dávek)`)
  } catch (chyba) {
    // Po chybě s xact_abort už server transakci vrátil; rollback tu jen uklidí
    // stav klienta a jeho vlastní chyba nesmí přebít tu původní.
    await transakce.rollback().catch(() => {})
    throw chyba
  }
}
