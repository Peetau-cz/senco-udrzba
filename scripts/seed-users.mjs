/**
 * Zakládá testovací uživatele pro každou roli a přiřazuje jim role a oblasti.
 *
 * Hesla spravuje Supabase Auth, takže uživatele nelze založit čistým SQL -
 * proto tento skript. Je to JEDINÉ místo v projektu, kde se používá
 * service_role klíč. Aplikační kód pod src/ pracuje výhradně uživatelským JWT
 * a oprávnění vynucuje RLS (zásada R1 v docs/NAVRH.md).
 *
 * Spuštění:  npm run seed:users
 * Vyžaduje:  .env.local s NEXT_PUBLIC_SUPABASE_URL a SUPABASE_SERVICE_ROLE_KEY
 *
 * Skript je idempotentní - existující uživatele nepřepisuje, jen doplní vazby.
 * NIKDY nespouštět proti ostrému prostředí.
 */

import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const heslo = process.env.SEED_HESLO ?? 'Senco.Test123'

if (!url || !serviceKey) {
  console.error(
    'Chybí NEXT_PUBLIC_SUPABASE_URL nebo SUPABASE_SERVICE_ROLE_KEY.\n' +
      'Zkopírujte .env.example jako .env.local a doplňte hodnoty ze Supabase → Project Settings → API.',
  )
  process.exit(1)
}

if (/\.supabase\.co/.test(url) && process.env.SEED_POTVRDIT_PROSTREDI !== 'ano') {
  console.warn(
    `\nCílíte na cloudový projekt: ${url}\n` +
      'Ujistěte se, že jde o VÝVOJOVÝ projekt, ne ostrý.\n' +
      'Potvrďte spuštěním s SEED_POTVRDIT_PROSTREDI=ano\n',
  )
  process.exit(1)
}

const db = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

/** Testovací uživatelé - jeden za každou roli ze zadání. */
const uzivatele = [
  {
    email: 'admin@senco.test',
    jmeno: 'Adam', prijmeni: 'Správce', osobni_cislo: '1001',
    role: ['administrator'],
    oblasti: [],
  },
  {
    email: 'vedouci@senco.test',
    jmeno: 'Petr', prijmeni: 'Vedoucí', osobni_cislo: '1002',
    role: ['vedouci_udrzby'],
    oblasti: [],
  },
  {
    email: 'cnc@senco.test',
    jmeno: 'Jan', prijmeni: 'Novák', osobni_cislo: '1003',
    role: ['specialista_cnc'],
    oblasti: [{ kod: 'cnc', vztah: 'garant' }],
  },
  {
    email: 'elektro@senco.test',
    jmeno: 'Martin', prijmeni: 'Dvořák', osobni_cislo: '1004',
    role: ['specialista_elektro'],
    oblasti: [{ kod: 'elektro', vztah: 'garant' }],
  },
  {
    email: 'udrzbar@senco.test',
    jmeno: 'Josef', prijmeni: 'Svoboda', osobni_cislo: '1005',
    role: ['udrzbar'],
    // Lakovna má podle zadání ř. 32-36 spolupracujícího pracovníka údržby.
    oblasti: [
      { kod: 'strojni', vztah: 'garant' },
      { kod: 'lakovna', vztah: 'spolupracujici' },
    ],
  },
  {
    email: 'lakovna@senco.test',
    jmeno: 'Eva', prijmeni: 'Králová', osobni_cislo: '1006',
    role: ['vedouci_lakovny'],
    oblasti: [{ kod: 'lakovna', vztah: 'garant' }],
  },
  {
    email: 'sklad@senco.test',
    jmeno: 'Tomáš', prijmeni: 'Horák', osobni_cislo: '1007',
    role: ['pracovnik_skladu'],
    oblasti: [{ kod: 'vzv', vztah: 'garant' }],
  },
  {
    email: 'management@senco.test',
    jmeno: 'Irena', prijmeni: 'Ředitelová', osobni_cislo: '1008',
    role: ['management'],
    oblasti: [],
  },
]

async function najdiUzivatele(email) {
  // Admin API neumí filtr podle e-mailu, je nutné stránkovat.
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const nalezeny = data.users.find((u) => u.email === email)
    if (nalezeny) return nalezeny
    if (data.users.length < 200) return null
  }
  return null
}

async function zalozUzivatele(u) {
  const { data, error } = await db.auth.admin.createUser({
    email: u.email,
    password: heslo,
    email_confirm: true,
    user_metadata: { jmeno: u.jmeno, prijmeni: u.prijmeni, osobni_cislo: u.osobni_cislo },
  })

  if (!error) return { id: data.user.id, novy: true }

  const jizExistuje = /already been registered|already exists/i.test(error.message)
  if (!jizExistuje) throw error

  const stavajici = await najdiUzivatele(u.email)
  if (!stavajici) throw new Error(`Uživatel ${u.email} hlásí duplicitu, ale nelze jej najít.`)
  return { id: stavajici.id, novy: false }
}

async function main() {
  const { data: role, error: chybaRoli } = await db.from('role').select('id, kod')
  if (chybaRoli) throw chybaRoli
  const { data: oblasti, error: chybaOblasti } = await db.from('oblast').select('id, kod')
  if (chybaOblasti) throw chybaOblasti

  if (!role?.length || !oblasti?.length) {
    console.error('Číselníky jsou prázdné. Nejdřív nahrajte supabase/seed.sql.')
    process.exit(1)
  }

  const roleDleKodu = new Map(role.map((r) => [r.kod, r.id]))
  const oblastiDleKodu = new Map(oblasti.map((o) => [o.kod, o.id]))

  for (const u of uzivatele) {
    const { id, novy } = await zalozUzivatele(u)

    // Profil vzniká triggerem nad auth.users; u existujícího uživatele
    // srovnáme údaje pro jistotu.
    const { error: chybaProfilu } = await db
      .from('profil')
      .update({
        jmeno: u.jmeno,
        prijmeni: u.prijmeni,
        osobni_cislo: u.osobni_cislo,
        email: u.email,
      })
      .eq('id', id)
    if (chybaProfilu) throw chybaProfilu

    const vazbyRoli = u.role.map((kod) => {
      const roleId = roleDleKodu.get(kod)
      if (!roleId) throw new Error(`Neznámá role: ${kod}`)
      return { uzivatel_id: id, role_id: roleId }
    })
    if (vazbyRoli.length) {
      const { error } = await db.from('uzivatel_role').upsert(vazbyRoli, {
        onConflict: 'uzivatel_id,role_id',
      })
      if (error) throw error
    }

    const vazbyOblasti = u.oblasti.map(({ kod, vztah }) => {
      const oblastId = oblastiDleKodu.get(kod)
      if (!oblastId) throw new Error(`Neznámá oblast: ${kod}`)
      return { uzivatel_id: id, oblast_id: oblastId, vztah }
    })
    if (vazbyOblasti.length) {
      const { error } = await db.from('uzivatel_oblast').upsert(vazbyOblasti, {
        onConflict: 'uzivatel_id,oblast_id',
      })
      if (error) throw error
    }

    const oblastiPopis = u.oblasti.length
      ? u.oblasti.map((o) => `${o.kod}/${o.vztah}`).join(', ')
      : 'všechny (dle role)'
    console.log(`${novy ? '+' : '='} ${u.email.padEnd(24)} ${u.role.join(', ').padEnd(22)} ${oblastiPopis}`)
  }

  console.log(`\nHotovo. Heslo pro všechny testovací účty: ${heslo}`)
}

main().catch((e) => {
  console.error('\nSeed selhal:', e.message ?? e)
  process.exit(1)
})
