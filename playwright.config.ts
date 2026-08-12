import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'list' : 'html',
  // Ve vývojovém režimu Next kompiluje routu až při prvním požadavku, takže
  // první přihlášení trvá i několik sekund. Výchozích 5 s na to nestačí.
  expect: { timeout: 20_000 },
  timeout: 60_000,
  use: {
    baseURL,
    trace: 'on-first-retry',
    locale: 'cs-CZ',
    timezoneId: 'Europe/Prague',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // Technici pracují na tabletu - rozvržení musí fungovat i tam.
    // Záměrně nad Chromiem s tabletovým viewportem, ne nad WebKitem: ověřujeme
    // rozvržení a dotykové ovládání, ne chování jiného renderovacího jádra.
    // Ušetří to stahování dalších 200 MB prohlížeče.
    {
      name: 'tablet',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1024, height: 768 },
        hasTouch: true,
        isMobile: false,
      },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
