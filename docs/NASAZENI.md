# Nasazení: přesun ze Supabase na SQL Server

**Rozhodnutí (7. 9. 2026): aplikace se přesune mimo Supabase.** Nahrazuje rozhodnutí
z 12. 8. 2026 „zůstáváme v Supabase Cloud" (`docs/PORTABILITA.md`).

**Upřesnění (8. 9. 2026): cílem je Microsoft SQL Server.** Cesta přes vlastní PostgreSQL
padla — ve firmě běží SQL Server (ZAKMAT, personalistika) a IT nemá provozovat druhý
databázový svět. Přesun probíhá jako samostatná fáze **po sloučení M6 (PR #12) a před M7**,
dokud jsou v databázi jen testovací data. Postup, architektura i otázky pro IT jsou níž;
stav prací sleduje `README.md`.

**Větve:** poslední stav se Supabase je zachovaný na větvi `supabase` a značce
`posledni-supabase` (commit `c8a2500`, M0–M6). Přesun se dělá na větvi `presun-sql-server`
a na konci se sloučí do `main` jedním PR jako každý modul — `main` se tím stane projektem
bez Supabase, `supabase` zůstane stát.

---

## 1. Proč

| Důvod                                                                                                                                                        | Co z něj plyne                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| **Data mají zůstat ve firmě.** Jména lidí, stroje, historie a fotky dnes leží v cloudu třetí strany.                                                         | Server u nás.                                              |
| **Supabase jako balík nechceme provozovat.** Self-hosted varianta by data nechala doma, ale IT by přebíralo Docker stack sedmi služeb cizí jejich prostředí. | Odchod ze Supabase, ne jen jeho přestěhování.              |
| **Dílna se nemá čím přihlásit.** Mail má jen garant oddělení; technici mají kartu na turniket a osobní číslo.                                                | Vlastní přihlašování (mail + heslo, karta / osobní číslo). |
| **Osoby a karty mají přijít z personalistiky**, která běží na SQL Serveru uvnitř firmy.                                                                      | Databáze vedle ZAKMATu, integrace pohledem.                |
| **Teď je to nejlevnější.** Reálné stroje a historie přijdou až po M7.                                                                                        | Neodkládat za M7.                                          |

---

## 2. Co zůstává a co se mění

### Zůstává

- **Aplikace** — Next.js, obrazovky, role, moduly M0–M6. Komponenty se nemění; dotazy
  zůstávají v týchž 22 souborech (`src/lib/*/dotazy.ts`, `actions.ts`) se stejnými tvary
  výsledků.
- **Datový model** — 22 tabulek, 5 pohledů, 8 výčtových typů, přepsané do T-SQL jako
  jedno konsolidované schéma (ne přehrávka 25 postgresových migrací; historie je na větvi
  `supabase`).
- **Oprávnění v databázi** (zásada R1) — Row-Level Security SQL Serveru, sloupcové
  granty, triggery s českými hláškami.
- **Osoba ≠ účet** — lidé bez přihlášení jsou v modelu od M6, karty mají vlastní tabulku.

### Mění se

| Vrstva          | Dnes                                   | Po přesunu                                                                                                                                                                   |
| --------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Přihlášení      | Supabase Auth (GoTrue), e-mail + heslo | vlastní: e-mail + heslo (hash scrypt v tabulce `prihlaseni`, ke které aplikace nemá SELECT), relace v podepsané cookie; karta zatím jen jako funkce v databázi (kiosek = M7) |
| Šev identity    | `aktualni_uzivatel()` čte `auth.uid()` | `SESSION_CONTEXT('osoba_id')`, nastavuje se v každé transakci; hodnota je rovnou **id osoby**                                                                                |
| Přístup k datům | supabase-js přes PostgREST             | Kysely s `MssqlDialect` (tedious), jeden aplikační login `udrzba_app`                                                                                                        |
| Soubory         | Supabase Storage, 3 nádoby, 12 politik | adresář na serveru aplikace (`SOUBORY_ADRESAR`), route handler `/soubory/…`; o přístupu rozhoduje tentýž dotaz, který dnes rozhoduje politika úložiště                       |
| Noční plánovač  | `pg_cron`                              | SQL Server Agent (záložně Plánovač úloh Windows), účet `udrzba_planovac`                                                                                                     |
| SQL testy       | 11 souborů plpgsql v SQL editoru       | T-SQL v `mssql/testy/`, spouští `npm run mssql:testy`                                                                                                                        |
| Migrace         | ručně v SQL editoru                    | `npm run mssql:migrace` (tabulka `_migrace` s otiskem)                                                                                                                       |
| Realtime        | —                                      | — (nepoužívá se)                                                                                                                                                             |

---

## 3. Cílová podoba

### Databáze `Udrzba`

- **Tři účty:** `udrzba_migrace` — vlastník databáze, jen migrace, seed a testy;
  `udrzba_app` — běh aplikace, jen práva z migrace, RLS ho omezuje; `udrzba_planovac` —
  jen `EXECUTE dbo.spust_planovac`. Aplikace se **nikdy nepřipojuje jako vlastník**.
- **Kolace `Czech_100_CI_AS`** (nebo stejná jako ZAKMAT), compatibility level 150,
  `RECURSIVE_TRIGGERS OFF`, `READ_COMMITTED_SNAPSHOT ON`. Co přesně založit, vypíše
  `npm run mssql:init -- --jen-vypis`.
- **RLS:** schéma `bezpecnost`, predikáty jako inline funkce se `SCHEMABINDING`, na každou
  tabulku jedna `SECURITY POLICY` (FILTER pro čtení, BLOCK pro zápis). Pomocné funkce
  `ma_roli`, `ma_pristup_k_oblasti`, `je_garantem_oblasti`, `muze_zapisovat`,
  `spravuje_ciselniky`, `spravuje_zarizeni_v_oblasti`, `provadi_udrzbu_v_oblasti`,
  `muze_menit_zapis_deniku` — stejná jména a stejná pravidla jako dnes.
- **Identita:** `dbo.aktualni_uzivatel()` = `SESSION_CONTEXT(N'osoba_id')`. Politiky,
  triggery i procedury volají jen ji.
- **Audit:** trigger vygenerovaný ze šablony pro každou z 21 tabulek (`FOR JSON`), stejný
  tvar záznamu jako dnes, takže obrazovka `/audit` se nemění.
- **Chyby:** `THROW 50001–50099` = nemáte oprávnění, `50100–50199` = porušené pravidlo
  (česká věta jde uživateli), `50200–50299` = nenalezeno, `50300–50399` = neplatný argument.

### Aplikace

- `src/lib/db/` — Kysely, řízená transakce `sIdentitou(osobaId, fn)`, která nastaví
  `SESSION_CONTEXT`, na konci ho vynuluje a spojení se při vrácení do poolu resetuje.
  Jediný překlad chyb v `chyby.ts`. Typy generuje `npm run mssql:typy`.
- `src/lib/auth/` — `heslo.ts` (scrypt), `relace.ts` (podepsaná cookie), `overovatel.ts`
  (rozhraní pro ověření hesla — dnes vlastní hash, později případně ZAKMAT), `session.ts`
  beze změny tvaru. `src/proxy.ts` ověřuje jen podpis cookie, bez databáze.
- `src/lib/storage/` — disk místo Supabase Storage, stejná tři jména funkcí.
- **Nově půjde nastavit heslo z aplikace** na kartě osoby (jen administrátor); Supabase to
  neumožňovalo.

---

## 4. Co potřebujeme od IT

### Žádost o vývojovou databázi

> Prosím o založení databáze `Udrzba_dev` na SQL Serveru (kolace `Czech_100_CI_AS`, pokud
> ZAKMAT nemá jinou, pak stejnou jako ZAKMAT; compatibility level 150,
> `READ_COMMITTED_SNAPSHOT ON`) a tří SQL loginů: `udrzba_migrace` jako vlastník této
> databáze, `udrzba_app` a `udrzba_planovac` jen s `CONNECT` (práva jim nastaví migrační
> skripty). Databáze slouží k vývoji náhrady za Supabase: data mají zůstat ve firmě, dílna
> se bude hlásit kartou, osoby přijdou z personalistiky. Skripty nic mimo tuto databázi
> nemění. Stejným postupem později vznikne ostrá `Udrzba`. Dále prosím o verzi a edici
> serveru (`SELECT @@VERSION`), zda běží SQL Server Agent, a zda lze v této databázi
> vytvářet snímky (`CREATE DATABASE … AS SNAPSHOT`) pro testy.

Záložní cesta, kdyby databáze na serveru nešla: **SQL Server Developer Edition** na vývojovém
počítači (bezplatná plná edice; Basic install, Mixed Mode, TCP zapnuté), databázi a loginy
pak založí `npm run mssql:init`. Kód se neliší, jen `.env.local`.

### Otázky, na které je potřeba odpověď před nasazením

1. **Jak ZAKMAT ověřuje heslo** (tabulka, sloupec, algoritmus, sůl, kódování; Delphi kód
   ověření) — rozhodne, zda se web přihlašuje proti ZAKMATu, nebo vede vlastní hesla.
2. `SELECT @@VERSION`, edice (Express = bez Agenta, bez snímků, limit 10 GB), instance
   a port, certifikát TLS na instanci (jde nastavit `MSSQL_TRUST_CERT=ne`?).
3. Ostrá databáze `Udrzba` se stejnými třemi účty jako vývojová; kdo drží hesla;
   kolace databáze ZAKMATu.
4. SQL Server Agent: k dispozici? Smí úloha běžet jako `udrzba_planovac`? Jinak
   Plánovač úloh Windows na aplikačním serveru.
5. Pohled jen pro čtení nad uživateli, zaměstnanci a kartami ZAKMATu (osobní číslo, jméno,
   karta, datum výstupu) a způsob přístupu (uživatel `udrzba_app` v databázi ZAKMAT se
   SELECT na pohled, nebo `DB_CHAINING`). **Je číslo karty v evidenci totéž, co přečte naše
   čtečka?** Ověřit na dvou třech kartách dřív, než se na to postaví párování.
6. Windows Server pro Node: verze, Node LTS, jak se spouští služba (NSSM/WinSW, nebo IIS
   jako reverzní proxy), TLS, hostname.
7. Adresář pro soubory (`SOUBORY_ADRESAR`) na aplikačním serveru, očekávaný objem,
   **v zálohách** se stejným RPO jako databáze; plán záloh `Udrzba` a jedna vyzkoušená
   obnova (zadání zálohování požaduje, ř. 172).
8. Síť: kdo se k aplikaci dostane (kancelář, Wi-Fi v hale pro tablety), firewall na SQL
   port jen z aplikačního serveru; přístup zvenčí ano/ne.

---

## 5. Postup prací

Jedno kolo = jeden commit ke kontrole. Před každým kolem `npm test`, `npm run typecheck`,
`npm run lint`; po každém kole s databází `npm run mssql:migrace && npm run mssql:testy`.

| Kolo | Obsah                                                                                                                 | Stav                  |
| ---- | --------------------------------------------------------------------------------------------------------------------- | --------------------- |
| R0   | větve `supabase` / `presun-sql-server`, závislosti, spouštěče `npm run mssql:*`, `.env.example`, tento dokument       | **hotovo 8. 9. 2026** |
| R1   | `mssql/migrace/0001_schema.sql` — tabulky, CHECKy, indexy, `prihlaseni`; seed; test `schema`                          | čeká na databázi      |
| R2   | funkce, triggery (audit generovaný), procedury (`zaloz_zakazky`, `dokonci_zakazku`…), pohledy; 8 testů                |                       |
| R3   | RLS, účty, granty; testy práv jako `udrzba_app`                                                                       |                       |
| R4   | `src/lib/db/`, přihlášení a relace, `src/proxy.ts`, první řez (zařízení, umístění, typy); e2e přihlášení              |                       |
| R5   | zbývající domény, jedna za commit: šablony, plán a zakázky, plnění a export, deník, audit, osoby a oblasti, číselníky |                       |
| R6   | soubory na disku a route handler `/soubory/…`                                                                         |                       |
| R7   | noční plánovač: úloha Agenta (`mssql/agent/`), záložní `npm run planovac`                                             |                       |
| R8   | úklid: smazat `supabase/` a balíčky Supabase, dokumenty (`PROVOZ.md`, `NAVRH.md`, `README.md`), e2e, PR do `main`     |                       |

Testovací data se nestěhují; do nové databáze se nahraje seed. Odhad 17–25 pracovních dní,
3–5 týdnů kalendářně. R0 a psaní T-SQL jdou dělat i bez databáze, otestovat se bez ní nedají.

### Nasazení na ostrý server (až po R8)

1. IT založí `Udrzba` a tři loginy (jako u vývojové databáze), Node LTS na aplikačním
   serveru, adresář pro soubory v zálohách.
2. `npm ci && npm run build`; `.env` s `MSSQL_*` (jen `udrzba_app`), `RELACE_TAJEMSTVI`,
   `SOUBORY_ADRESAR`.
3. `npm run mssql:migrace` pod `udrzba_migrace`; první správce dostane heslo skriptem
   `npm run mssql:heslo`.
4. Úloha Agenta z `mssql/agent/planovac_job.sql` (nebo Plánovač úloh).
5. `next start` jako služba Windows za reverzní proxy s TLS.

---

## 6. Pasti, které se poznají pozdě

- **RLS SQL Serveru filtruje i vlastníka databáze.** Predikáty proto mají výjimku pro
  `db_owner` (migrace, seed, procedury `EXECUTE AS OWNER`); testy práv musí běžet pod
  `EXECUTE AS USER = 'udrzba_app'`, jinak testují nic.
- **Chybějící BLOCK predikát znamená „povoleno".** Kde Postgres neměl politiku (INSERT a
  DELETE na `zakazka`, DELETE na `provozni_denik`, vše na `audit_log`…), nesmí mít
  `udrzba_app` GRANT. Blokovaný UPDATE hlásí chybu 33504, ne nula řádků.
- **`OUTPUT` nejde nad tabulkou s triggerem** (chyba 334) → id generuje aplikace, procedury
  `SET @id = NEWID()` před INSERT. Žádné `.returning()`.
- **Sloupcový GRANT na INSERT neexistuje.** `vytvoreno_at` a `zmeneno_at` přepíše trigger.
- **Chyba v triggeru vrátí celou transakci.** V aplikaci řízená transakce, která po chybě
  potlačí chybu rollbacku (jinak přebije českou hlášku). V T-SQL testech proto žádná vnější
  transakce: očekávané chyby se chytají `TRY/CATCH` a stav se po souboru obnoví snímkem
  nebo `mssql:reset`.
- **`SESSION_CONTEXT` je na spojení, ne na transakci.** S poolem by druhý požadavek zdědil
  uživatele z prvního: nastavit na začátku každé transakce, na konci vynulovat, spojení při
  vrácení do poolu resetovat.
- **`SCHEMABINDING` predikátů blokuje `ALTER TABLE`** sloupců, které predikát čte — politiku
  shodit, změnit, postavit znovu (`mssql/migrace/_sablona_zmena_sloupce.sql`). Totéž platí
  pro funkce použité v CHECK.
- **Cizí klíče na `profil` jen `NO ACTION`** — SQL Server odmítá vícenásobné kaskádové cesty
  (chyba 1785). `profil` se stejně nemaže (R5).
- **Ovladač tedious:** GUID chodí velkými písmeny (`lowerCaseGuids: true`), `date` jako
  `Date` (čte se jako text `CONVERT(char(10), x, 23)`), `bigint` jako text, JS `Date` se
  nikdy neváže jako parametr (šel by jako `datetime` s přesností 3 ms) — časy jdou jako ISO
  text.
- **Express nemá Agenta ani snímky.** Plánovač z Plánovače úloh, testy s `mssql:reset`.
- **Podpisový klíč relace je stejně citlivý jako servisní klíč.** Kdo ho drží, vydá si
  libovolnou identitu. Patří výhradně na server, nikdy do gitu.
- **Kód karty.** Formát v personalistice nemusí odpovídat tomu, co čte čtečka. Ověřit před
  stavbou párování (otázka 5).

---

## 7. Zásady, které platí dál

1. **Oprávnění vynucuje databáze** (R1). Aplikace nikdy nepracuje s právem, které obchází
   řádková omezení.
2. **Osoba není účet.** Do `dokoncil_id`, `provedl_id` a spol. patří id osoby.
3. **Šev identity je jedna funkce.** Politiky volají `aktualni_uzivatel()`, nikdy
   mechanismus přihlášení přímo.
4. **Dotazy zůstávají v datové vrstvě** (`src/lib/*/dotazy.ts`, `actions.ts`), ne
   v komponentách — proto je výměna klienta mechanická.
5. **Soubory za vlastním rozhraním** (`src/lib/storage/`).
6. **Aplikovaná migrace se nemění** — změna patří do nové migrace; `_migrace` to hlídá otiskem.

---

## Odkazy

- `mssql/README.md` — co kde leží a jak se to pouští
- `docs/PORTABILITA.md` — původní rozvaha z 12. 8. 2026 (nahrazeno)
- `docs/PROVOZ.md` — zálohy, osobní údaje, prostředí
- Pokus s vlastním přihlášením nad Supabase (28. 8. 2026) prokázal, že oprávnění v databázi
  platí nad vlastním tokenem stejně jako nad původním — pro SQL Server je to důkaz principu.
