/**
 * Ověření Row Level Security přes stejné rozhraní, jaké používá aplikace.
 *
 * Na rozdíl od supabase/tests/rls.sql, který běží uvnitř databáze, tenhle skript
 * se skutečně přihlásí jako testovací uživatel a mluví s REST API veřejným
 * klíčem — tedy přesně tak, jak by to udělal útočník s otevřenou konzolí
 * prohlížeče. Když projde tohle, oprávnění drží i mimo uživatelské rozhraní.
 *
 * Spuštění:  npm run overit:rls
 * Vyžaduje:  .env.local a proběhlý npm run seed:users
 */

import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const heslo = process.env.SEED_HESLO ?? 'Senco.Test123'

if (!url || !anon) {
  console.error('Chybí NEXT_PUBLIC_SUPABASE_URL nebo NEXT_PUBLIC_SUPABASE_ANON_KEY.')
  process.exit(1)
}

let proslo = 0
let selhalo = 0

function overit(popis, podminka, detail = '') {
  if (podminka) {
    console.log(`  ✓ ${popis}`)
    proslo++
  } else {
    console.log(`  ✗ ${popis}${detail ? ' — ' + detail : ''}`)
    selhalo++
  }
}

function klient() {
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function jako(email) {
  const db = klient()
  const { error } = await db.auth.signInWithPassword({ email, password: heslo })
  if (error) throw new Error(`Přihlášení ${email} selhalo: ${error.message}`)
  return db
}

async function main() {
  console.log(`\nOvěřuji RLS proti ${url}\n`)

  // --- Nepřihlášený uživatel -------------------------------------------------
  console.log('Nepřihlášený návštěvník:')
  {
    const db = klient()
    const { data, error } = await db.from('oblast').select('*')
    overit(
      'nevidí žádné oblasti',
      error !== null || (data ?? []).length === 0,
      error ? '' : `vrátilo ${data?.length} řádků`,
    )
  }

  // --- Specialista CNC: jen svá oblast (zadání ř. 52) ------------------------
  console.log('\nSpecialista CNC:')
  {
    const db = await jako('cnc@senco.test')
    const { data: oblasti } = await db.from('oblast').select('kod')
    overit('vidí právě jednu oblast', oblasti?.length === 1, `vidí ${oblasti?.length}`)
    overit('a je to jeho vlastní (cnc)', oblasti?.[0]?.kod === 'cnc', `vidí ${oblasti?.[0]?.kod}`)

    const { data: uzivatel } = await db.auth.getUser()
    const mojeId = uzivatel.user?.id
    const { data: vazby } = await db.from('uzivatel_role').select('uzivatel_id')
    const cizi = (vazby ?? []).filter((v) => v.uzivatel_id !== mojeId)
    overit('nevidí role ostatních uživatelů', cizi.length === 0, `vidí ${cizi.length} cizích`)

    const { error: chybaAuditu } = await db.from('audit_log').select('id').limit(1)
    const { data: audit } = await db.from('audit_log').select('id').limit(1)
    overit(
      'nevidí auditní log',
      chybaAuditu !== null || (audit ?? []).length === 0,
      'audit by měl být jen pro vedení',
    )
  }

  // --- Vedoucí údržby: všechny oblasti (zadání ř. 51) -----------------------
  console.log('\nVedoucí údržby:')
  {
    const db = await jako('vedouci@senco.test')
    const { data: oblasti } = await db.from('oblast').select('kod')
    overit('vidí všech pět oblastí', oblasti?.length === 5, `vidí ${oblasti?.length}`)

    const { data: audit } = await db.from('audit_log').select('id').limit(1)
    overit('vidí auditní log', Array.isArray(audit), 'měl by mít přístup')
  }

  // --- Management: čte vše, nezapíše nic (zadání ř. 49) ---------------------
  console.log('\nManagement (pouze čtení):')
  {
    const db = await jako('management@senco.test')
    const { data: oblasti } = await db.from('oblast').select('kod')
    overit('vidí všech pět oblastí', oblasti?.length === 5, `vidí ${oblasti?.length}`)

    const { error: chybaZapisu } = await db
      .from('umisteni')
      .insert({ kod: 'TEST-RLS-SMAZAT', nazev: 'Pokus o zápis managementem' })
    overit('NESMÍ zapsat do umístění', chybaZapisu !== null, 'zápis prošel, politika nedrží!')

    const { error: chybaZmeny } = await db
      .from('oblast')
      .update({ nazev: 'Přejmenováno managementem' })
      .eq('kod', 'cnc')
    const { data: kontrola } = await db.from('oblast').select('nazev').eq('kod', 'cnc')
    overit(
      'NESMÍ přejmenovat oblast',
      chybaZmeny !== null || kontrola?.[0]?.nazev === 'Údržba CNC strojů',
      'název se změnil!',
    )
  }

  // --- Neměnnost auditu (zadání ř. 162, zásada R5) --------------------------
  console.log('\nNeměnnost auditního logu:')
  {
    const db = await jako('vedouci@senco.test')
    const { error: chybaMazani } = await db.from('audit_log').delete().gte('id', 0)
    overit(
      'auditní log NELZE mazat ani vedoucímu',
      chybaMazani !== null,
      'mazání prošlo — odebraná práva nedrží!',
    )

    const { error: chybaUpravy } = await db
      .from('audit_log')
      .update({ tabulka: 'podvrzeno' })
      .gte('id', 0)
    overit('auditní log NELZE upravovat', chybaUpravy !== null, 'úprava prošla!')

    const { data: zaznamy } = await db.from('audit_log').select('tabulka').limit(5)
    overit(
      'audit zaznamenal zakládání číselníků',
      (zaznamy ?? []).length > 0,
      'log je prázdný, trigger možná neběží',
    )
  }

  console.log(`\n${'-'.repeat(50)}`)
  console.log(`Prošlo: ${proslo}   Selhalo: ${selhalo}`)

  if (selhalo > 0) {
    console.log('\nOPRÁVNĚNÍ NEDRŽÍ. Modul M0 nelze považovat za hotový.')
    process.exit(1)
  }
  console.log('\nOprávnění drží i mimo uživatelské rozhraní.')
}

main().catch((e) => {
  console.error('\nOvěření selhalo:', e.message ?? e)
  process.exit(1)
})
