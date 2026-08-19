# SENCO Údržba

Centrální systém řízení údržby výrobní společnosti SENCO Příbram.

| Dokument | Obsah |
|---|---|
| `docs/zadani.txt` | Původní zadání |
| `docs/NAVRH.md` | Návrh systému — architektura, datový model, role, navigace, wireframy, workflow, stack |
| `docs/PRIPRAVA_DAT.md` | Co musí dodat garanti oblastí, aby šel systém spustit |
| `docs/PROVOZ.md` | Provozní rozhodnutí — zálohy, osobní údaje, prostředí, notifikace |
| `docs/PORTABILITA.md` | Co by stál přesun mimo Supabase a co je pro něj připravené |

Stav: **M0 (základ)** hotový — přihlášení, role a oprávnění vynucená v databázi.
**M1 (evidence zařízení)** hotový a čeká na schválení: schéma, karty, formuláře,
přílohy (fotky, návody, certifikáty), správa typů a jejich vlastních parametrů,
strom umístění a filtrování seznamu po sloupcích.
Historie zařízení na kartě záměrně chybí — doplní ji M5.
Import zařízení z CSV (rozhodnutí P6) se udělá až s M2, aby vznikl jedním
průchodem i pro šablony.
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

# Číselníky - nahrajte v SQL editoru Supabase v tomto pořadí:
#   supabase/seed.sql           oblasti a role
#   supabase/seed_umisteni.sql  areál, haly a provozy
#   supabase/seed_cnc.sql       typy a stroje CNC z docs/Harmonogram_udrzby_CNC_stroju.xlsx
#   supabase/seed_sablony_cnc.sql  šablona údržby CNC z téhož souboru (až po migraci 0006)

# Testovací uživatelé
SEED_POTVRDIT_PROSTREDI=ano npm run seed:users

# Přiřazení lidí k oblastem - až po seed:users, potřebuje existující profily
#   supabase/prirazeni_uzivatelu.sql

# Typy z databáze. Soubor src/types/database.types.ts je v repozitáři, takže
# tenhle krok NENÍ nutný ke spuštění - a bez propojeného CLI ho nepouštějte
# vůbec, přepsal by ho prázdným výstupem.
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
Totéž zvenčí, přes REST API a veřejný klíč: `npm run overit:rls` — ten navíc zkouší
nahrát přílohu jménem uživatelů, kteří na to nemají právo.

Ke schématu patří ještě tři skripty, které se pouštějí stejně: `supabase/tests/sablony.sql`
ověřuje neměnnost aktivované verze, `supabase/tests/plan.sql` to, že plán údržby přežije
vydání nové verze šablony se zadanými termíny, a `supabase/tests/zakazky.sql` neměnnost
uzavřené zakázky.

## Přílohy karet zařízení

Fotky, návody a certifikáty leží v **neveřejné** nádobě `zarizeni` v Supabase Storage,
kterou zakládá migrace `0004_uloziste_zarizeni.sql`. Aplikace k nim vydává podepsané
odkazy s hodinovou platností — přímý odkaz do úložiště tedy nejde poslat mimo firmu.

Limit je 10 MB na soubor, přijímají se JPG, PNG, WEBP a PDF. Hranice je nastavená na
třech místech schválně: v rozhraní (kvůli hlášce), na nádobě (kvůli volání API napřímo)
a v `next.config.ts` u server actions (jinak by se soubor nad 1 MB vůbec neodeslal).

Nahrávání, mazání i podepisování odkazů obstarává `src/lib/storage/` — jediné místo,
které o Supabase Storage ví. Pravidla pro soubory (velikost, typy, cesta) jsou vedle
v `src/lib/zarizeni/soubory.ts` a jsou schválně bez závislostí, aby se daly testovat.

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
   ne nasazení nové verze. Totéž platí pro typy zařízení a jejich technické parametry —
   garant si je nastaví v `/zarizeni/typy`, aniž by se sahalo na kód.
6. **Schéma je oddělené od systému přihlašování.** Migrace `0001` je čistý PostgreSQL;
   `0002` je jediný soubor závislý na Supabase. Politiky volají
   `public.aktualni_uzivatel()`, nikdy `auth.uid()` přímo. Viz `docs/PORTABILITA.md`.
7. **K úložišti se chodí přes `src/lib/storage/`.** Stránky, serverové akce ani dotazy
   `supabase.storage` nevolají. Úložiště je ta část Supabase, která se při přesunu na
   firemní server nepřenese sama — díky téhle vrstvě se mění jeden soubor, ne deset míst.

## Firemní síť: `npm install` visí bez chybové hlášky

Firemní proxy provádí inspekci TLS. Windows její kořenové autoritě věří, ale Node má
vlastní seznam autorit a nevidí ji — `npm install` se pak zasekne a nic nevypíše.
Projeví se to tak, že `node_modules` nevzniká a proces skoro nevytěžuje procesor.

Ověření:

```powershell
node -e "require('https').get('https://registry.npmjs.org/next', r => console.log(r.statusCode)).on('error', e => console.log(e.message))"
```

Když vypíše `self-signed certificate in certificate chain`, vyexportujte důvěryhodné
autority z Windows a nasměrujte na ně Node:

```powershell
$pem = "$env:USERPROFILE\ca-bundle-windows.pem"
$radky = foreach ($c in (Get-ChildItem Cert:\LocalMachine\Root, Cert:\CurrentUser\Root)) {
  "-----BEGIN CERTIFICATE-----"
  [Convert]::ToBase64String($c.RawData, 'InsertLineBreaks')
  "-----END CERTIFICATE-----"
}
Set-Content -Path $pem -Value ($radky -join "`n") -Encoding ascii
[Environment]::SetEnvironmentVariable('NODE_EXTRA_CA_CERTS', $pem, 'User')
```

Node pak věří přesně tomu, čemu věří systém. **Nepoužívejte `strict-ssl false` ani
`NODE_TLS_REJECT_UNAUTHORIZED=0`** — to ověřování certifikátů vypne úplně.

## Bezpečnostní upozornění

`npm run seed:users` a `npx supabase db reset` **mažou nebo přepisují data**.
Nikdy je nespouštějte proti ostrému projektu. Seed skript se proto ptá na potvrzení
proměnnou `SEED_POTVRDIT_PROSTREDI=ano`.
