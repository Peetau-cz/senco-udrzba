import { expect, test } from '@playwright/test'

/**
 * Smoke test modulu M0.
 *
 * Předpoklad: proběhla migrace, seed.sql i npm run seed:users, takže existují
 * testovací účty popsané ve scripts/seed-users.mjs.
 */

const HESLO = process.env.SEED_HESLO ?? 'Senco.Test123'

const UCTY = {
  specialistaCnc: process.env.E2E_EMAIL_CNC ?? 'cnc@senco.test',
  vedouci: process.env.E2E_EMAIL_VEDOUCI ?? 'vedouci@senco.test',
  management: process.env.E2E_EMAIL_MANAGEMENT ?? 'management@senco.test',
}

async function prihlas(page: import('@playwright/test').Page, email: string) {
  await page.goto('/login')
  await expect(page.getByLabel('Firemní e-mail')).toBeVisible()
  await page.getByLabel('Firemní e-mail').fill(email)
  await page.getByLabel('Heslo').fill(HESLO)
  await page.getByRole('button', { name: 'Přihlásit se' }).click()
  await expect(page).toHaveURL('/')
}

/**
 * Odhlášení je server action s přesměrováním. Bez počkání na dokončení by
 * následující goto('/login') mohlo přijít uprostřed navigace - test pak občas
 * spadne na tom, že formulář ještě není na stránce.
 */
async function odhlas(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Odhlásit' }).click()
  await expect(page).toHaveURL(/\/login/)
  await expect(page.getByLabel('Firemní e-mail')).toBeVisible()
}

test('nepřihlášený uživatel je přesměrován na přihlášení', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/login/)
  await expect(page.getByRole('heading', { name: 'SENCO Údržba' })).toBeVisible()
})

test('nesprávné heslo přihlášení nepustí', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Firemní e-mail').fill(UCTY.specialistaCnc)
  await page.getByLabel('Heslo').fill('spatne-heslo')
  await page.getByRole('button', { name: 'Přihlásit se' }).click()

  // Scope na formulář: Next přidává do stránky vlastní prvek s role="alert"
  // (hlásič změny routy), takže samotné getByRole('alert') je nejednoznačné.
  await expect(page.locator('form').getByRole('alert')).toContainText(
    'Nesprávný e-mail nebo heslo',
  )
  await expect(page).toHaveURL(/\/login/)
})

test('přihlášení, dashboard a odhlášení', async ({ page }) => {
  await prihlas(page, UCTY.specialistaCnc)

  // Po přihlášení je první obrazovkou dashboard, nikdy ne seznam zařízení (zadání ř. 56).
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Dobrý den')

  await odhlas(page)
  await expect(page).toHaveURL(/\/login/)
})

test('menu se liší podle role', async ({ page }) => {
  const navigace = () => page.getByRole('navigation', { name: 'Hlavní navigace' })

  // Specialista CNC - žádná správa uživatelů, žádný audit.
  await prihlas(page, UCTY.specialistaCnc)
  await expect(navigace().getByRole('link', { name: 'Dashboard' })).toBeVisible()
  await expect(navigace().getByRole('link', { name: 'Zařízení' })).toBeVisible()
  await expect(navigace().getByRole('link', { name: 'Uživatelé' })).toHaveCount(0)
  await expect(navigace().getByRole('link', { name: 'Audit' })).toHaveCount(0)
  await odhlas(page)

  // Management - vidí audit, nesmí spravovat uživatele ani číselníky (zadání ř. 49).
  await prihlas(page, UCTY.management)
  await expect(navigace().getByRole('link', { name: 'Audit' })).toBeVisible()
  await expect(navigace().getByRole('link', { name: 'Uživatelé' })).toHaveCount(0)
  await expect(navigace().getByRole('link', { name: 'Číselníky' })).toHaveCount(0)
})

test('přepínač oblastí nabízí jen dostupné oblasti', async ({ page }) => {
  // Specialista CNC má jedinou oblast - přepínat není co, jen se zobrazí.
  // Scope na hlavičku: název oblasti je i na dlaždici "Vaše oblasti" v obsahu.
  await prihlas(page, UCTY.specialistaCnc)
  await expect(page.getByRole('banner').getByText('Údržba CNC strojů')).toBeVisible()
  await expect(page.getByRole('combobox')).toHaveCount(0)
  await odhlas(page)

  // Vedoucí údržby má přístup ke všem pěti oblastem (zadání ř. 51).
  await prihlas(page, UCTY.vedouci)
  const prepinac = page.getByRole('combobox')
  await expect(prepinac).toBeVisible()
  // Pět oblastí + volba "Všechny".
  await expect(prepinac.locator('option')).toHaveCount(6)
})
