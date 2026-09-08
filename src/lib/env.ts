import { z } from 'zod'

/**
 * Jediné místo, kde se sahá na process.env. ESLint to jinde zakazuje
 * (viz eslint.config.mjs) - chyba v názvu proměnné tak spadne při startu
 * a s jasnou hláškou, ne až za běhu někde uprostřed stránky.
 *
 * Pozor: service_role klíč zde záměrně NENÍ. Patří výhradně do
 * scripts/seed-users.mjs. Viz docs/PROVOZ.md kap. 3.
 *
 * Přesun na SQL Server (docs/NASAZENI.md): proměnné pro SQL Server, relaci
 * a soubory jsou do dokončení přesunu VOLITELNÉ, aby aplikace nad Supabase
 * dál nastartovala. Kdo je potřebuje (src/lib/db, src/lib/auth), si o ně
 * řekne přes `vyzadujSqlServer()` a dostane srozumitelnou chybu, když chybí.
 * V posledním kole přesunu se prohodí: Supabase zmizí, tyhle budou povinné.
 */
const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url('NEXT_PUBLIC_SUPABASE_URL musí být platná URL'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, 'NEXT_PUBLIC_SUPABASE_ANON_KEY chybí'),

  MSSQL_SERVER: z.string().min(1).optional(),
  MSSQL_PORT: z.coerce.number().int().positive().optional(),
  MSSQL_INSTANCE: z.string().min(1).optional(),
  MSSQL_DATABASE: z.string().min(1).default('Udrzba'),
  MSSQL_TRUST_CERT: z.enum(['ano', 'ne']).default('ano'),
  MSSQL_APP_USER: z.string().min(1).default('udrzba_app'),
  MSSQL_APP_PASSWORD: z.string().min(1).optional(),
  MSSQL_POOL_MAX: z.coerce.number().int().positive().default(10),

  RELACE_TAJEMSTVI: z.string().min(32, 'RELACE_TAJEMSTVI musí mít aspoň 32 znaků').optional(),
  RELACE_PLATNOST_H: z.coerce.number().positive().default(12),
  SOUBORY_ADRESAR: z.string().min(1).default('./data/soubory'),
})

const vysledek = schema.safeParse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,

  MSSQL_SERVER: process.env.MSSQL_SERVER,
  MSSQL_PORT: process.env.MSSQL_PORT,
  MSSQL_INSTANCE: process.env.MSSQL_INSTANCE,
  MSSQL_DATABASE: process.env.MSSQL_DATABASE,
  MSSQL_TRUST_CERT: process.env.MSSQL_TRUST_CERT,
  MSSQL_APP_USER: process.env.MSSQL_APP_USER,
  MSSQL_APP_PASSWORD: process.env.MSSQL_APP_PASSWORD,
  MSSQL_POOL_MAX: process.env.MSSQL_POOL_MAX,

  RELACE_TAJEMSTVI: process.env.RELACE_TAJEMSTVI,
  RELACE_PLATNOST_H: process.env.RELACE_PLATNOST_H,
  SOUBORY_ADRESAR: process.env.SOUBORY_ADRESAR,
})

if (!vysledek.success) {
  const chyby = vysledek.error.issues.map((i) => `  - ${i.message}`).join('\n')
  throw new Error(
    `Chybí nastavení prostředí:\n${chyby}\n\nZkopírujte .env.example jako .env.local a doplňte hodnoty.`,
  )
}

export const env = vysledek.data

/** Nastavení SQL Serveru, nebo srozumitelná chyba, když v .env.local chybí. */
export function vyzadujSqlServer() {
  const chybi = [
    !env.MSSQL_SERVER && 'MSSQL_SERVER',
    !env.MSSQL_APP_PASSWORD && 'MSSQL_APP_PASSWORD',
    !env.RELACE_TAJEMSTVI && 'RELACE_TAJEMSTVI',
  ].filter((x): x is string => typeof x === 'string')

  if (chybi.length > 0) {
    throw new Error(
      `Pro SQL Server chybí v .env.local: ${chybi.join(', ')} (vzor je v .env.example).`,
    )
  }
  if (env.MSSQL_INSTANCE && env.MSSQL_PORT) {
    throw new Error('MSSQL_INSTANCE a MSSQL_PORT se vylučují - nastavte jen jedno.')
  }

  return {
    server: env.MSSQL_SERVER as string,
    port: env.MSSQL_INSTANCE ? undefined : (env.MSSQL_PORT ?? 1433),
    instance: env.MSSQL_INSTANCE,
    database: env.MSSQL_DATABASE,
    veritCertifikatu: env.MSSQL_TRUST_CERT === 'ano',
    uzivatel: env.MSSQL_APP_USER,
    heslo: env.MSSQL_APP_PASSWORD as string,
    poolMax: env.MSSQL_POOL_MAX,
    relaceTajemstvi: env.RELACE_TAJEMSTVI as string,
    relacePlatnostH: env.RELACE_PLATNOST_H,
    souboryAdresar: env.SOUBORY_ADRESAR,
  }
}
