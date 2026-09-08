// Next.js 16 zrušil `next lint` i integraci ESLintu do next.config, takže se
// lint pouští samostatně přes `npm run lint` (eslint .).
//
// Importy jsou schválně BEZ přípony `.js`: eslint-config-next 16 má v package.json
// `exports` mapu, která definuje právě `./core-web-vitals` a `./typescript`.
// S příponou by Node hlásil ERR_PACKAGE_PATH_NOT_EXPORTED. (U verze 15 to bylo
// obráceně - ta exports mapu neměla a příponu vyžadovala. Balíček proto musí
// zůstat ve stejné hlavní verzi jako `next`.)
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'

const eslintConfig = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'coverage/**',
      'playwright-report/**',
      'src/types/database.types.ts',
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      // service_role klíč nesmí do aplikačního kódu - viz docs/PROVOZ.md kap. 3.
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'env',
          message: 'Načítejte proměnné prostředí přes src/lib/env.ts, ne přímo z process.env.',
        },
      ],
    },
  },
  {
    // Skripty, konfigurace a e2e testy běží mimo aplikaci a k process.env
    // přistupovat smějí. E2E sem přibylo s Next 16: `next lint` je nekontroloval,
    // `eslint .` ano - přihlašovací údaje testovacích účtů se ale z env brát musí.
    files: ['scripts/**', 'e2e/**', '*.config.*', 'src/lib/env.ts'],
    rules: { 'no-restricted-properties': 'off' },
  },
]

export default eslintConfig
