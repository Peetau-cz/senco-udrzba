import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FlatCompat } from '@eslint/eslintrc'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const compat = new FlatCompat({ baseDirectory: __dirname })

const eslintConfig = [
  {
    ignores: ['.next/**', 'node_modules/**', 'coverage/**', 'playwright-report/**', 'src/types/database.types.ts'],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      // service_role klíč nesmí do aplikačního kódu - viz docs/PROVOZ.md kap. 3.
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'env',
          message:
            'Načítejte proměnné prostředí přes src/lib/env.ts, ne přímo z process.env.',
        },
      ],
    },
  },
  {
    // Skripty a konfigurace běží mimo aplikaci a k process.env přistupovat smějí.
    files: ['scripts/**', '*.config.*', 'src/lib/env.ts'],
    rules: { 'no-restricted-properties': 'off' },
  },
]

export default eslintConfig
