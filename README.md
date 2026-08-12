# SENCO Údržba

Centrální systém řízení údržby výrobní společnosti SENCO Příbram.

| Dokument | Obsah |
|---|---|
| `docs/zadani.txt` | Původní zadání |
| `docs/NAVRH.md` | Návrh systému — architektura, datový model, role, navigace, wireframy, workflow, stack |
| `docs/PRIPRAVA_DAT.md` | Co musí dodat garanti oblastí, aby šel systém spustit |
| `docs/PROVOZ.md` | Provozní rozhodnutí — zálohy, osobní údaje, prostředí, notifikace |

Stav: **modul M0 (základ)** — přihlášení, role a oprávnění vynucená v databázi.
Plán modulů M0–M7 je v `docs/NAVRH.md` kap. 8.

---

## Předpoklady

- **Node.js 20.6+** (kvůli `--env-file`) a **npm**
- **Git**
- Projekt v **Supabase Cloud**, region EU — pro vývoj použijte samostatný projekt,
  oddělený od ostrého

Docker není potřeba, vývoj běží proti cloudové databázi.

## Zprovoznění

```bash
npm install

# Nastavení prostředí
cp .env.example .env.local        # ve Windows: copy .env.example .env.local
# doplňte hodnoty ze Supabase → Project Settings → API

# Propojení s projektem a nahrání schématu
npx supabase init                 # vytvoří supabase/config.toml, migrace nepřepíše
npx supabase link --project-ref <project-ref>
npm run db:push

# Číselníky (oblasti a role) - nahrajte supabase/seed.sql v SQL editoru Supabase

# Testovací uživatelé
SEED_POTVRDIT_PROSTREDI=ano npm run seed:users

# Typy z databáze - MUSÍ proběhnout před typecheckem
npm run db:types

npm run dev
```

Aplikace běží na <http://localhost:3000>.

## Testovací účty

Zakládá je `npm run seed:users`, heslo pro všechny je `Senco.Test123`
(lze změnit proměnnou `SEED_HESLO`).

| E-mail | Role | Oblasti |
|---|---|---|
| `admin@senco.test` | Administrátor | všechny |
| `vedouci@senco.test` | Vedoucí údržby | všechny |
| `cnc@senco.test` | Specialista CNC | CNC (garant) |
| `elektro@senco.test` | Specialista elektro | elektro (garant) |
| `udrzbar@senco.test` | Údržbář | strojní (garant), lakovna (spolupracující) |
| `lakovna@senco.test` | Vedoucí lakovny | lakovna (garant) |
| `sklad@senco.test` | Pracovník skladu | VZV (garant) |
| `management@senco.test` | Management | všechny, pouze čtení |

## Příkazy

| Příkaz | Co dělá |
|---|---|
| `npm run dev` | vývojový server |
| `npm run build` | produkční build (selže při typové nebo lint chybě) |
| `npm run typecheck` | kontrola typů |
| `npm run lint` | ESLint |
| `npm test` | jednotkové testy (Vitest) |
| `npm run test:e2e` | end-to-end testy (Playwright) |
| `npm run db:push` | nahraje migrace do propojeného projektu |
| `npm run db:types` | vygeneruje `src/types/database.types.ts` |
| `npm run seed:users` | založí testovací uživatele |

Ověření oprávnění na úrovni databáze: spusťte `supabase/tests/rls.sql` v SQL editoru
Supabase. Skript nic nemění a při porušení pravidel vyhodí výjimku s popisem.

## Zásady, které platí napříč kódem

1. **Oprávnění vynucuje databáze, ne aplikace.** Row Level Security je bezpečnostní
   hranice; `src/lib/auth/opravneni.ts` rozhoduje jen o tom, co uživatel *vidí* v menu.
   Kdyby se obojí rozešlo, uživatel dostane prázdný seznam — nikdy cizí data.
2. **`service_role` klíč patří výhradně do `scripts/seed-users.mjs`.** V kódu pod `src/`
   nemá co dělat. Aplikace pracuje uživatelským JWT.
3. **Neměnnost auditu drží odebraná práva, ne konvence.** Na `audit_log` nemá přihlášený
   uživatel `UPDATE` ani `DELETE`.
4. **Databáze česky bez diakritiky** (`snake_case`), **kód anglicky**, texty pro
   uživatele česky. Data v UTC, zobrazení `Europe/Prague`.
5. **Oblasti údržby jsou data, ne výčet v kódu.** Šestá oblast je záznam v číselníku,
   ne nasazení nové verze.

## Bezpečnostní upozornění

`npm run seed:users` a `npx supabase db reset` **mažou nebo přepisují data**.
Nikdy je nespouštějte proti ostrému projektu. Seed skript se proto ptá na potvrzení
proměnnou `SEED_POTVRDIT_PROSTREDI=ano`.
