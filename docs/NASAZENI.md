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

| Důvod                                                                                                                                                        | Co z něj plyne                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| **Data mají zůstat ve firmě.** Jména lidí, stroje, historie a fotky dnes leží v cloudu třetí strany.                                                         | Server u nás.                                                         |
| **Supabase jako balík nechceme provozovat.** Self-hosted varianta by data nechala doma, ale IT by přebíralo Docker stack sedmi služeb cizí jejich prostředí. | Odchod ze Supabase, ne jen jeho přestěhování.                         |
| **Dílna se nemá čím přihlásit.** Mail má jen garant oddělení; technici mají kartu na turniket a osobní číslo.                                                | Vlastní přihlašování (mail + heslo; dílna jménem a PINem na tabletu). |
| **Osoby a karty mají přijít z personalistiky**, která běží na SQL Serveru uvnitř firmy.                                                                      | Databáze vedle ZAKMATu, integrace pohledem.                           |
| **Teď je to nejlevnější.** Reálné stroje a historie přijdou až po M7.                                                                                        | Neodkládat za M7.                                                     |

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
- **Osoba ≠ účet** — lidé bez hesla jsou v modelu od M6; dílna se hlásí PINem (tabulka
  `pin`), karty se od 25. 9. nepoužívají.

### Mění se

| Vrstva          | Dnes                                   | Po přesunu                                                                                                                                                                                        |
| --------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Přihlášení      | Supabase Auth (GoTrue), e-mail + heslo | vlastní: e-mail + heslo (hash scrypt v tabulce `prihlaseni`, ke které aplikace nemá SELECT), relace v podepsané cookie; dílna na registrovaném tabletu jménem a vlastním PINem (M7, NAVRH kap. 8) |
| Šev identity    | `aktualni_uzivatel()` čte `auth.uid()` | `SESSION_CONTEXT('osoba_id')`, nastavuje se v každé transakci; hodnota je rovnou **id osoby**                                                                                                     |
| Přístup k datům | supabase-js přes PostgREST             | Kysely s `MssqlDialect` (tedious), jeden aplikační login `udrzba_app`                                                                                                                             |
| Soubory         | Supabase Storage, 3 nádoby, 12 politik | adresář na serveru aplikace (`SOUBORY_ADRESAR`), route handler `/soubory/…`; o přístupu rozhoduje tentýž dotaz, který dnes rozhoduje politika úložiště                                            |
| Noční plánovač  | `pg_cron`                              | SQL Server Agent (záložně Plánovač úloh Windows), účet `udrzba_planovac`                                                                                                                          |
| SQL testy       | 11 souborů plpgsql v SQL editoru       | T-SQL v `mssql/testy/`, spouští `npm run mssql:testy`                                                                                                                                             |
| Migrace         | ručně v SQL editoru                    | `npm run mssql:migrace` (tabulka `_migrace` s otiskem)                                                                                                                                            |
| Realtime        | —                                      | — (nepoužívá se)                                                                                                                                                                                  |

---

## 3. Cílová podoba

### Databáze `Udrzba`

- **Dvě instance na `SENS-SQL`:** `TEST` = vývoj (`Udrzba_dev` vedle kopie ZAKMATu),
  `ZAKMAT` = ostrý provoz (`Udrzba` vedle ostrého ZAKMATu). `Udrzba` je vždy na téže
  instanci jako ZAKMAT — dotaz přes instance nejde.
- **Tři účty** (na každé instanci zvlášť, loginy se mezi instancemi nesdílejí):
  - **účet pro migrace** — člen `db_owner`; na TEST `senco_udr_test`, lokálně
    `udrzba_migrace`; jen migrace, seed a testy (`MSSQL_MIGRACE_*`). Vlastníkem databáze
    je ten, kdo ji založil (IT);
  - `udrzba_app` — běh aplikace, jen práva z migrace, RLS ho omezuje; v ZAKMATu smí jen
    `SELECT` na `dbo.UZIVATEL` (výběr osob, přihlášení e-mailem);
  - `udrzba_planovac` — jen `EXECUTE dbo.spust_planovac`.

  Aplikace se **nikdy nepřipojuje jako účet pro migrace**: člena `db_owner` řádková
  práva neomezují.

- **Kolace `SQL_Czech_CP1250_CI_AS`** (stejná jako ZAKMAT, aby dotazy přes obě databáze
  nepadaly na konfliktu kolací), compatibility level **130** — server je SQL Server 2016
  a výš neumí, `RECURSIVE_TRIGGERS OFF`, `READ_COMMITTED_SNAPSHOT ON`.
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
- **Dva druhy relace** (rozhodnuto 25. 9. 2026): heslem (kancelář, garanti, běžná
  platnost) a **jménem a PINem na registrovaném tabletu** (dílna; krátká, odhlášení po
  nečinnosti, relace nese id tabletu). Tablet se registruje jednou adminem: tabulka
  `tablet` (hash tajného tokenu, aktivní, naposledy viděn) a dlouhodobá httpOnly cookie
  zařízení.
- **PIN ověřuje databáze, ne aplikace.** Tabulka `pin` (sůl, hash SHA2-512, musí změnit,
  počet chyb, zámek); aplikace na ni nemá žádné právo. Procedura `prihlas_pinem` (`EXECUTE
AS OWNER`) v jedné transakci ověří tablet, zámek a PIN (`HASHBYTES` uvnitř SQL Serveru)
  a zapíše pokus; vrátí jen výsledek. Dál `nastav_pin` (admin, dočasný), `zmen_pin`
  (osoba), `odemkni_pin` (admin). 4–6 číslic, slabé se odmítnou; 5 chyb = 15 min, 10 chyb
  = do odemčení.
- `src/lib/storage/` — disk místo Supabase Storage, stejná tři jména funkcí.
- **Nově půjde nastavit heslo z aplikace** na kartě osoby (jen administrátor); Supabase to
  neumožňovalo.

---

## 4. Co potřebujeme od IT

### Založení databází (požadavek podán 24. 9. 2026, IT slíbilo do týdne)

IT zakládá jen databáze; vlastníkem je ten, kdo je založí. Loginy a jejich práva si
zařídí autor projektu sám, tabulky vytvoří `npm run mssql:migrace`.

> **Prosím o založení dvou databází na SENS-SQL:**
>
> 1. `Udrzba_dev` na instanci **TEST** (vývoj)
> 2. `Udrzba` na instanci **ZAKMAT** (ostrý provoz)
>
> Obě: kolace `SQL_Czech_CP1250_CI_AS`, compatibility level `130`,
> `READ_COMMITTED_SNAPSHOT ON`, `RECURSIVE_TRIGGERS OFF`. `Udrzba` prosím zařadit do
> pravidelných záloh.

```sql
-- SENS-SQL\TEST
CREATE DATABASE Udrzba_dev COLLATE SQL_Czech_CP1250_CI_AS;
GO
ALTER DATABASE Udrzba_dev SET COMPATIBILITY_LEVEL = 130;
ALTER DATABASE Udrzba_dev SET READ_COMMITTED_SNAPSHOT ON;
ALTER DATABASE Udrzba_dev SET RECURSIVE_TRIGGERS OFF;
GO

-- SENS-SQL\ZAKMAT
CREATE DATABASE Udrzba COLLATE SQL_Czech_CP1250_CI_AS;
GO
ALTER DATABASE Udrzba SET COMPATIBILITY_LEVEL = 130;
ALTER DATABASE Udrzba SET READ_COMMITTED_SNAPSHOT ON;
ALTER DATABASE Udrzba SET RECURSIVE_TRIGGERS OFF;
GO
```

### Loginy (zařídí autor projektu, na každé instanci zvlášť)

| Login                                       | V databázi Údržby              | V ZAKMATu (na TEST jeho kopie)     |
| ------------------------------------------- | ------------------------------ | ---------------------------------- |
| účet pro migrace (`senco_udr_test` na TEST) | člen `db_owner`                | — (pro průzkum stačí `SELECT` níž) |
| `udrzba_app`                                | uživatel bez práv (dá migrace) | `SELECT` na `dbo.UZIVATEL`         |
| `udrzba_planovac`                           | uživatel bez práv (dá migrace) | —                                  |

Tabulky se ručně nezakládají — jinak nesedí evidence `_migrace`.

Záložní cesta, kdyby databáze na serveru nešla: **SQL Server Developer Edition** na vývojovém
počítači (bezplatná plná edice; Basic install, Mixed Mode, TCP zapnuté), databázi a loginy
pak založí `npm run mssql:init`. Kód se neliší, jen `.env.local`.

### Otázky, na které je potřeba odpověď před nasazením

1. **Jak ZAKMAT ověřuje heslo** (tabulka, sloupec, algoritmus, sůl, kódování; Delphi kód
   ověření) — rozhodne, zda se web přihlašuje proti ZAKMATu, nebo vede vlastní hesla.
2. ~~Verze a edice~~ — **zjištěno 8. 9.:** `SENS-SQL\ZAKMAT` je SQL Server 2016 SP3
   Standard (dynamický port). Zbývá: verze instance `TEST`, přesný název kopie ZAKMATu na
   TEST (zjistí `npm run mssql:prozkoumej`) a certifikát TLS (`MSSQL_TRUST_CERT=ne`?).
3. ~~Ostrá databáze~~ — **požádáno 24. 9.** spolu s vývojovou. Loginy na instanci ZAKMAT
   se zakládají znovu (z TEST se nepřenášejí), s jinými hesly.
4. SQL Server Agent: k dispozici? Smí úloha běžet jako `udrzba_planovac`? Jinak
   Plánovač úloh Windows na aplikačním serveru.
5. ~~Přístup k uživatelům ZAKMATu~~ — **rozhodnuto 24. 9.:** `udrzba_app` dostane
   `SELECT` přímo na `dbo.UZIVATEL` — ve vývoji v kopii ZAKMATu na TEST, v provozu
   v ostrém ZAKMATu; bez pohledu a bez `DB_CHAINING`. Karty (`UZIVATEL_KARTA`) od 25. 9.
   nepotřebujeme — dílna se hlásí PINem.
6. Windows Server pro Node: verze, Node LTS, jak se spouští služba (NSSM/WinSW, nebo IIS
   jako reverzní proxy), TLS, hostname.
7. Adresář pro soubory (`SOUBORY_ADRESAR`) na aplikačním serveru, očekávaný objem,
   **v zálohách** se stejným RPO jako databáze; plán záloh `Udrzba` a jedna vyzkoušená
   obnova (zadání zálohování požaduje, ř. 172).
8. Síť: kdo se k aplikaci dostane (kancelář, Wi-Fi v hale pro tablety), firewall na SQL
   port jen z aplikačního serveru; přístup zvenčí ano/ne.

---

## 5. Postup prací

**Podrobné pořadí od 25. 9. 2026 je v `docs/PLAN_PRESUNU.md`** (kola K0, K1, R3–R8, M7);
tabulka níž je přehled.

Jedno kolo = jeden commit ke kontrole. Před každým kolem `npm test`, `npm run typecheck`,
`npm run lint`; po každém kole s databází `npm run mssql:migrace && npm run mssql:testy`.

| Kolo | Obsah                                                                                                                                                                                                                   | Stav                                                                      |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| R0   | větve `supabase` / `presun-sql-server`, závislosti, spouštěče `npm run mssql:*`, `.env.example`, tento dokument                                                                                                         | **hotovo 8. 9. 2026**                                                     |
| R1   | `mssql/migrace/0001_schema.sql` — tabulky, CHECKy, indexy, `prihlaseni`; seed; test `schema`. Před prvním spuštěním úprava podle 25. 9.: tabulky `tablet` a `pin`, procedury PINu, pryč role `kiosek` a tabulka `karta` | napsáno naslepo, čeká na `Udrzba_dev` na TEST                             |
| R2   | funkce, triggery (audit generovaný), procedury (`zaloz_zakazky`, `dokonci_zakazku`…), pohledy; 8 testů                                                                                                                  | napsáno naslepo (`0002`–`0005`, seed `04`, 4 testy), čeká na `Udrzba_dev` |
| R3   | RLS, účty, granty; testy práv jako `udrzba_app`                                                                                                                                                                         |                                                                           |
| R4   | `src/lib/db/`, přihlášení heslem a relace (připravené na druh „tablet"), `src/proxy.ts`, první řez; e2e přihlášení                                                                                                      |                                                                           |
| R5   | zbývající domény, jedna za commit: šablony, plán a zakázky, plnění a export, deník, audit, osoby a oblasti, číselníky                                                                                                   |                                                                           |
| R6   | soubory na disku a route handler `/soubory/…`                                                                                                                                                                           |                                                                           |
| R7   | noční plánovač: úloha Agenta (`mssql/agent/`), záložní `npm run planovac`                                                                                                                                               |                                                                           |
| R8   | úklid: smazat `supabase/` a balíčky Supabase, dokumenty (`PROVOZ.md`, `NAVRH.md`, `README.md`), e2e, PR do `main`                                                                                                       |                                                                           |

Testovací data se nestěhují; do nové databáze se nahraje seed. Odhad 17–25 pracovních dní,
3–5 týdnů kalendářně. R0 a psaní T-SQL jdou dělat i bez databáze, otestovat se bez ní nedají.

**Až IT připraví `Udrzba_dev` a budou loginy:** `.env.local` na `SENS-SQL` / instance `TEST` /
`Udrzba_dev`, `MSSQL_MIGRACE_USER=senco_udr_test`; ověřit čtením
(`npm run mssql:prozkoumej -- --databaze=Udrzba_dev,<kopie ZAKMATu>`), pak
`npm run mssql:migrace && npm run mssql:seed && npm run mssql:testy`.

### Nasazení na ostrý server (až po R8)

1. Databáze `Udrzba` na instanci **ZAKMAT** už existuje (požádáno 24. 9.). Loginy znovu
   a s jinými hesly podle tabulky v kap. 4, `SELECT` pro `udrzba_app` v ostrém ZAKMATu;
   Node LTS na aplikačním serveru, adresář pro soubory v zálohách.
2. `npm ci && npm run build`; `.env` s `MSSQL_*` (jen `udrzba_app`), `RELACE_TAJEMSTVI`,
   `SOUBORY_ADRESAR`.
3. `npm run mssql:migrace` pod účtem pro migrace; první správce dostane heslo skriptem
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
- **Trigger v SQL Serveru běží až po zápisu.** Zámek, který v PostgreSQL běžel BEFORE,
  musí rozhodovat podle `deleted`, ne podle tabulky — jinak by si uživatel přepsal
  `vytvoreno_at` a obešel okno na opravu deníku (`smi_menit_zapis_deniku` bere hodnoty).
  Razítko je vnořený UPDATE; ostatní triggery tabulky ho poznají přes
  `trigger_nestlevel(object_id(N'dbo.<tabulka>_zmena')) > 0`.
- **SQL Server 2016 nebere proměnnou jako cestu JSON** (`JSON_VALUE`, `JSON_MODIFY`) a nemá
  `STRING_AGG` — klíče se párují přes `OPENJSON`, skládá se přes `FOR JSON` / `FOR XML`.
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
- **Instance jsou oddělené servery.** Loginy i hesla má každá zvlášť a dotaz
  `ZAKMAT.dbo.…` přes instance nejde (linked server nechceme). Proto `Udrzba_dev` leží na
  TEST vedle kopie ZAKMATu a ostrá `Udrzba` na instanci ZAKMAT vedle ostrého.
- **Snímky databáze potřebují serverové právo `CREATE DATABASE`**, které vlastník `Udrzba_dev` nemá
  (a Express je nemá vůbec). `mssql:testy` pak po každém souboru databázi smaže, znovu
  zmigruje a nahraje celý seed — funguje, jen pomaleji. Express navíc nemá Agenta →
  Plánovač úloh.
- **Podpisový klíč relace je stejně citlivý jako servisní klíč.** Kdo ho drží, vydá si
  libovolnou identitu. Patří výhradně na server, nikdy do gitu.
- **Hash čtyřmístného PINu se po úniku prolomí hned** (10 000 kombinací). Ochrana proto
  není v hashi, ale v tom, že hash databázi neopustí: porovnává se uvnitř procedury,
  aplikace na tabulku `pin` nemá právo a zkoušet PINy jde jen po jednom přes zámek.
- **Procedura s `EXECUTE AS OWNER` nesmí číst ZAKMAT.** Zosobnění se do jiné databáze
  nepustí (bez `TRUSTWORTHY`, který nechceme). Co se čte ze ZAKMATu, čte aplikace pod
  `udrzba_app`; proceduře v Údržbě předá výsledek (osobní číslo).

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
