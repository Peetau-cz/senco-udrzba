/**
 * Testovací osoby, jejich role, oblasti, karty a hesla (docs/NASAZENI.md).
 *
 * Nahrazuje `scripts/seed-users.mjs` ze Supabase. Hesla už nespravuje cizí
 * služba: hash počítá Node (src/lib/auth/heslo.ts) a ukládá se do tabulky
 * `prihlaseni`, do které smí zapisovat jen vlastník databáze - proto seed běží
 * jako vlastník (MSSQL_MIGRACE_USER), ne jako aplikace.
 *
 * Idempotentní: osobu pozná podle osobního čísla, doplní jen chybějící vazby
 * a heslo nastaví jen tomu, kdo ho ještě nemá (změněné heslo z aplikace se
 * nepřepisuje). NIKDY nespouštět proti ostré databázi.
 */

import { zahashujHeslo } from '../../src/lib/auth/heslo.ts'
import { sql } from './mssql.mjs'

/** Jeden účet za každou roli ze zadání. Stejné e-maily čekají e2e testy. */
export const UZIVATELE = [
  {
    email: 'admin@senco.test',
    jmeno: 'Adam',
    prijmeni: 'Správce',
    osobniCislo: 1001,
    role: ['administrator'],
    oblasti: [],
  },
  {
    email: 'vedouci@senco.test',
    jmeno: 'Petr',
    prijmeni: 'Vedoucí',
    osobniCislo: 1002,
    role: ['vedouci_udrzby'],
    oblasti: [],
  },
  {
    email: 'cnc@senco.test',
    jmeno: 'Jan',
    prijmeni: 'Novák',
    osobniCislo: 1003,
    role: ['specialista_cnc'],
    oblasti: [{ kod: 'cnc', vztah: 'garant' }],
  },
  {
    email: 'elektro@senco.test',
    jmeno: 'Martin',
    prijmeni: 'Dvořák',
    osobniCislo: 1004,
    role: ['specialista_elektro'],
    oblasti: [{ kod: 'elektro', vztah: 'garant' }],
  },
  {
    email: 'udrzbar@senco.test',
    jmeno: 'Josef',
    prijmeni: 'Svoboda',
    osobniCislo: 1005,
    role: ['udrzbar'],
    // Lakovna má podle zadání ř. 32-36 spolupracujícího pracovníka údržby.
    oblasti: [
      { kod: 'strojni', vztah: 'garant' },
      { kod: 'lakovna', vztah: 'spolupracujici' },
    ],
  },
  {
    email: 'lakovna@senco.test',
    jmeno: 'Eva',
    prijmeni: 'Králová',
    osobniCislo: 1006,
    role: ['vedouci_lakovny'],
    oblasti: [{ kod: 'lakovna', vztah: 'garant' }],
  },
  {
    email: 'sklad@senco.test',
    jmeno: 'Tomáš',
    prijmeni: 'Horák',
    osobniCislo: 1007,
    role: ['pracovnik_skladu'],
    oblasti: [{ kod: 'vzv', vztah: 'garant' }],
  },
  {
    email: 'management@senco.test',
    jmeno: 'Irena',
    prijmeni: 'Ředitelová',
    osobniCislo: 1008,
    role: ['management'],
    oblasti: [],
  },
]

/**
 * Lidé z dílny: mail ani heslo nemají, v systému jsou jako osoby bez
 * přihlášení a u kiosku (M7) se prokážou kartou. Kiosek sám je od přesunu
 * osoba s rolí `kiosek` bez přihlášení - technický e-mail ze Supabase padl.
 */
export const OSOBY_BEZ_UCTU = [
  {
    jmeno: 'Karel',
    prijmeni: 'Zámečník',
    osobniCislo: 2001,
    role: ['udrzbar'],
    oblasti: [{ kod: 'strojni', vztah: 'spolupracujici' }],
    karta: 'KARTA-2001',
  },
  {
    jmeno: 'Alena',
    prijmeni: 'Nováková',
    osobniCislo: 2002,
    role: ['udrzbar'],
    oblasti: [{ kod: 'lakovna', vztah: 'spolupracujici' }],
    karta: 'KARTA-2002',
  },
  {
    jmeno: 'Kiosek',
    prijmeni: 'Strojní údržba',
    osobniCislo: 9001,
    role: ['kiosek'],
    oblasti: [{ kod: 'strojni', vztah: 'spolupracujici' }],
    karta: null,
  },
]

async function mapaKodu(pool, tabulka) {
  const { recordset } = await pool.request().query(`select id, kod from dbo.[${tabulka}]`)
  return new Map(recordset.map((r) => [r.kod, r.id]))
}

async function najdiNeboZalozOsobu(pool, o) {
  const hledani = pool.request().input('osobni_cislo', sql.Int, o.osobniCislo)
  const { recordset } = await hledani.query(
    'select id from dbo.profil where osobni_cislo = @osobni_cislo',
  )

  const zapis = pool
    .request()
    .input('jmeno', sql.NVarChar(100), o.jmeno)
    .input('prijmeni', sql.NVarChar(100), o.prijmeni)
    .input('osobni_cislo', sql.Int, o.osobniCislo)
    .input('email', sql.NVarChar(254), o.email ?? null)

  if (recordset[0]) {
    await zapis.input('id', sql.UniqueIdentifier, recordset[0].id).query(
      `update dbo.profil set jmeno = @jmeno, prijmeni = @prijmeni, email = @email
       where id = @id and (jmeno <> @jmeno or prijmeni <> @prijmeni or isnull(email, N'') <> isnull(@email, N''))`,
    )
    return { id: recordset[0].id, novy: false }
  }

  const id = crypto.randomUUID()
  await zapis.input('id', sql.UniqueIdentifier, id).query(
    `insert into dbo.profil (id, jmeno, prijmeni, osobni_cislo, email)
     values (@id, @jmeno, @prijmeni, @osobni_cislo, @email)`,
  )
  return { id, novy: true }
}

async function priradRole(pool, id, kody, roleDleKodu) {
  for (const kod of kody) {
    const roleId = roleDleKodu.get(kod)
    if (!roleId) throw new Error(`Neznámá role: ${kod}. Proběhl seed číselníků?`)
    await pool
      .request()
      .input('uzivatel_id', sql.UniqueIdentifier, id)
      .input('role_id', sql.UniqueIdentifier, roleId)
      .query(
        `insert into dbo.uzivatel_role (uzivatel_id, role_id)
         select @uzivatel_id, @role_id
         where not exists (select 1 from dbo.uzivatel_role where uzivatel_id = @uzivatel_id and role_id = @role_id)`,
      )
  }
}

async function priradOblasti(pool, id, oblasti, oblastiDleKodu) {
  for (const { kod, vztah } of oblasti) {
    const oblastId = oblastiDleKodu.get(kod)
    if (!oblastId) throw new Error(`Neznámá oblast: ${kod}. Proběhl seed číselníků?`)
    await pool
      .request()
      .input('uzivatel_id', sql.UniqueIdentifier, id)
      .input('oblast_id', sql.UniqueIdentifier, oblastId)
      .input('vztah', sql.NVarChar(30), vztah)
      .query(
        `update dbo.uzivatel_oblast set vztah = @vztah
         where uzivatel_id = @uzivatel_id and oblast_id = @oblast_id and vztah <> @vztah;
         insert into dbo.uzivatel_oblast (uzivatel_id, oblast_id, vztah)
         select @uzivatel_id, @oblast_id, @vztah
         where not exists (select 1 from dbo.uzivatel_oblast where uzivatel_id = @uzivatel_id and oblast_id = @oblast_id)`,
      )
  }
}

/** Unikátnost čísla platí jen mezi aktivními kartami, proto se hledá aktivní. */
async function priradKartu(pool, id, cislo) {
  await pool
    .request()
    .input('profil_id', sql.UniqueIdentifier, id)
    .input('cislo', sql.NVarChar(60), cislo)
    .query(
      `insert into dbo.karta (profil_id, cislo)
       select @profil_id, @cislo
       where not exists (select 1 from dbo.karta where cislo = @cislo and aktivni = 1)`,
    )
}

/** Heslo dostane jen ten, kdo ještě žádné nemá - změna z aplikace přežije seed. */
async function nastavHesloPokudChybi(pool, id, heslo) {
  const { recordset } = await pool
    .request()
    .input('profil_id', sql.UniqueIdentifier, id)
    .query('select 1 as ma from dbo.prihlaseni where profil_id = @profil_id')
  if (recordset[0]) return false

  await pool
    .request()
    .input('profil_id', sql.UniqueIdentifier, id)
    .input('heslo_hash', sql.NVarChar(300), await zahashujHeslo(heslo))
    .query('insert into dbo.prihlaseni (profil_id, heslo_hash) values (@profil_id, @heslo_hash)')
  return true
}

/**
 * @param {import('mssql').ConnectionPool} pool - připojení jako vlastník databáze
 * @param {{ heslo: string, log?: (radek: string) => void }} volby
 */
export async function nahrajOsoby(pool, volby) {
  const log = volby.log ?? console.log
  const roleDleKodu = await mapaKodu(pool, 'role')
  const oblastiDleKodu = await mapaKodu(pool, 'oblast')

  if (roleDleKodu.size === 0 || oblastiDleKodu.size === 0) {
    throw new Error('Číselníky jsou prázdné - seed SQL souborů musí běžet první.')
  }

  for (const u of UZIVATELE) {
    const { id, novy } = await najdiNeboZalozOsobu(pool, u)
    await priradRole(pool, id, u.role, roleDleKodu)
    await priradOblasti(pool, id, u.oblasti, oblastiDleKodu)
    const noveHeslo = await nastavHesloPokudChybi(pool, id, volby.heslo)
    const oblasti = u.oblasti.length
      ? u.oblasti.map((o) => `${o.kod}/${o.vztah}`).join(', ')
      : 'všechny (dle role)'
    log(
      `${novy ? '+' : '='} ${u.email.padEnd(26)} ${u.role.join(', ').padEnd(20)} ${oblasti}${noveHeslo ? '  (heslo nastaveno)' : ''}`,
    )
  }

  log('\nOsoby bez přihlášení (dílna a kiosek):')
  for (const o of OSOBY_BEZ_UCTU) {
    const { id, novy } = await najdiNeboZalozOsobu(pool, o)
    await priradRole(pool, id, o.role, roleDleKodu)
    await priradOblasti(pool, id, o.oblasti, oblastiDleKodu)
    if (o.karta) await priradKartu(pool, id, o.karta)
    const oblasti = o.oblasti.map((x) => `${x.kod}/${x.vztah}`).join(', ')
    log(
      `${novy ? '+' : '='} ${`${o.jmeno} ${o.prijmeni}`.padEnd(26)} ${(o.karta ?? 'bez karty').padEnd(20)} ${oblasti}`,
    )
  }
}
