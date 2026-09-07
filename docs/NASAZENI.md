# Nasazení: přesun mimo Supabase

**Rozhodnutí (7. 9. 2026): aplikace se přesune mimo Supabase.** Nahrazuje rozhodnutí
z 12. 8. 2026 „zůstáváme v Supabase Cloud" (`docs/PORTABILITA.md`). Přesun proběhne jako
samostatná fáze **po dokončení M6 a před M7**, dokud jsou v databázi jen testovací data.

Co se ještě nerozhodlo: **PostgreSQL, nebo Microsoft SQL Server.** Rozhodne IT podle toho,
co je ochotné provozovat. Tento dokument je podklad k tomu jednání.

---

## 1. Proč

| Důvod                                                                                                                                                        | Co z něj plyne                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| **Data mají zůstat ve firmě.** Jména lidí, stroje, historie a fotky dnes leží v cloudu třetí strany.                                                         | Server u nás.                                              |
| **Supabase jako balík nechceme provozovat.** Self-hosted varianta by data nechala doma, ale IT by přebíralo Docker stack sedmi služeb cizí jejich prostředí. | Odchod ze Supabase, ne jen jeho přestěhování.              |
| **Dílna se nemá čím přihlásit.** Mail má jen garant oddělení; technici mají kartu na turniket a osobní číslo.                                                | Vlastní přihlašování (mail + heslo, karta / osobní číslo). |
| **Osoby a karty mají přijít z personalistiky**, která běží na SQL Serveru uvnitř firmy.                                                                      | Dosažitelné jen ze serveru ve firmě — z cloudu nikdy.      |
| **Teď je to nejlevnější.** Reálné stroje a historie přijdou až po M7.                                                                                        | Neodkládat za M7.                                          |

---

## 2. Co zůstává a co se mění

Čísla jsou změřená z repozitáře k 7. 9. 2026, ne odhadnutá.

### Zůstává

- **Aplikace** — Next.js, obrazovky, role, moduly M0–M6. Přesun se týká toho, co je pod ní.
- **Datový model** — 22 tabulek, 5 pohledů, 8 výčtových typů. Z 25 migrací (5 109 řádků)
  je **19 čistý PostgreSQL** bez vazby na Supabase.
- **Oprávnění v databázi** (zásada R1). 65 politik Row Level Security, 52 funkcí,
  50 triggerů. Obě cílové databáze to umí; přesun oprávnění do aplikace by byl rychlejší
  a horší.
- **Osoba ≠ účet** (migrace 0024). Lidé bez přihlášení jsou v modelu od M6, karty mají
  vlastní tabulku s vlastní RLS.

### Mění se — tři adaptéry a plánovač

| Vrstva          | Dnes                                   | Po přesunu                                                                                                 | Rozsah                                                                                                                                                                                     |
| --------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Přihlášení      | Supabase Auth (GoTrue), e-mail + heslo | vlastní: mail + heslo pro kancelář (hash u nás), karta / osobní číslo pro dílnu, relace v podepsané cookie | 6 souborů (`src/lib/auth/session.ts`, `src/lib/supabase/*`, `src/middleware.ts`, `src/app/login/actions.ts`), migrace 0002 a 0025                                                          |
| Šev identity    | `aktualni_uzivatel()` čte `auth.uid()` | čte identitu z proměnné požadavku (`set local` v transakci / `SESSION_CONTEXT`)                            | 1 migrace — přesně k tomu byl šev od 0001 stavěný                                                                                                                                          |
| Přístup k datům | supabase-js přes PostgREST             | přímé připojení, Kysely                                                                                    | 21 souborů, 107 dotazů `.from()`, 5 volání funkcí `.rpc()`, 24 vnořených selectů PostgREST (ty se nepřepisují 1:1). **supabase-js žije jen na serveru** — z prohlížeče se nepřepisuje nic. |
| Soubory         | Supabase Storage, 3 nádoby, 24 politik | adresář na serveru aplikace; o přístupu rozhoduje tentýž dotaz, který dnes rozhoduje politika úložiště     | `src/lib/storage/index.ts` (109 řádků, 3 funkce), migrace 0004, 0012, 0016, 0022                                                                                                           |
| Noční plánovač  | `pg_cron`, 2 úlohy                     | `pg_cron` na vlastním PostgreSQL, nebo SQL Server Agent                                                    | migrace 0014                                                                                                                                                                               |
| Realtime        | —                                      | —                                                                                                          | **nepoužívá se**, 0 míst                                                                                                                                                                   |
| SQL testy       | 11 souborů, 3 448 řádků plpgsql        | beze změny (PostgreSQL) / přepis do T-SQL (SQL Server)                                                     |                                                                                                                                                                                            |

---

## 3. Dvě zbývající cesty

|                                | **P — PostgreSQL**                                                 | **M — SQL Server**                                                                                                                                                                           |
| ------------------------------ | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Databáze                       | vlastní PostgreSQL 15+ od IT                                       | databáze na stávajícím SQL Serveru vedle ZAKMATu                                                                                                                                             |
| Schéma                         | 19 migrací beze změny; 2 auth + 4 storage nahradí jedna adaptérová | **přepis do T-SQL**: 65 politik → security policies, 52 funkcí → procedury/funkce, 50 triggerů (`inserted`/`deleted`), 8 enumů → check/číselník, 81× `jsonb` → `nvarchar(max)` + JSON funkce |
| Ruční přepis idiomů            | —                                                                  | 42× přetypování `::`, 46× `raise exception`, 8 intervalů, 7× `filter (where …)`, 5× `lateral`                                                                                                |
| Oprávnění                      | RLS beze změny                                                     | Row-Level Security (od 2016) + `SESSION_CONTEXT`                                                                                                                                             |
| Plánovač                       | `pg_cron` — IT musí povolit rozšíření                              | SQL Server Agent — **není v edici Express**                                                                                                                                                  |
| Testy                          | beze změny                                                         | přepis 3 448 řádků                                                                                                                                                                           |
| Osoby a karty z personalistiky | noční skript ve firmě, nebo přímo z DB (`tds_fdw`)                 | **pohled nebo procedura na téže instanci** — nejjednodušší možná integrace                                                                                                                   |
| Odhad                          | 6–9 dní kódu, 2–3 týdny kalendářně                                 | 3–5 týdnů                                                                                                                                                                                    |
| Co provozuje IT                | PostgreSQL + jeden proces Node + adresář na fotky                  | databáze na SQL Serveru + jeden proces Node + adresář na fotky                                                                                                                               |
| Cena pro IT                    | druhý databázový svět vedle SQL Serveru                            | jeden svět, který znají                                                                                                                                                                      |

Aplikační část (přihlášení, Kysely, soubory) je v obou cestách stejná — liší se dialekt.

---

## 4. Co rozhodne IT

Otázky, na které je potřeba odpověď před prvním řádkem kódu:

1. **PostgreSQL, nebo SQL Server?** Pokud SQL Server: verze a edice (`select @@version`),
   je k dispozici SQL Server Agent, stejná instance jako ZAKMAT a personalistika?
2. **Kde poběží aplikace** — Windows server s Node jako službou, nebo Linux / Docker?
3. **Kam fotky** (adresář na serveru aplikace) a jsou v zálohách?
4. **Zálohy:** kdo, jak často, byla obnova vyzkoušená; přijatelná ztráta dat a doba
   výpadku (zadání zálohování požaduje, ř. 172).
5. **Síť:** reverzní proxy a certifikát; přístup zvenčí ano/ne; Wi-Fi v hale pro tablety.
6. **Personalistika:** tabulka nebo pohled se zaměstnanci (osobní číslo, jméno, příjmení,
   číslo karty; je tam stav / datum výstupu?); účet jen pro čtení; **je číslo karty
   v evidenci totéž, co přečte naše čtečka?** — ověřit na dvou třech kartách dřív, než se
   na to postaví párování.

---

## 5. Pořadí prací

1. **Dokončit a sloučit M6** na dnešním prostředí — poslední milník na Supabase. Přesun
   pak jede z čistého `main`.
2. **Fáze „Přesun"**, po krocích s kontrolou po každém:
   1. schéma a oprávnění na cílové databázi + SQL testy — bez aplikace, ověřitelné samo
   2. vlastní přihlášení a šev identity — mail + heslo; karta zatím jen jako funkce
   3. datová vrstva — Kysely, 21 souborů dotazů; aplikace běží nad novou databází
   4. soubory a plánovač
   5. osoby a karty z personalistiky
3. **M7 (dílna)** — QR štítky, tablety, tisk protokolů — už nad novým prostředím.

Testovací data se nestěhují; do nové databáze se nahrají seedy. To je hlavní důvod,
proč se přesun dělá teď a ne po M7.

---

## 6. Pasti, které se poznají pozdě

- **Identita jen v transakci.** `set local` (PostgreSQL) i `SESSION_CONTEXT` (SQL Server)
  se nastavují na začátku každé transakce, ne na spojení — s poolem by druhý požadavek
  zdědil uživatele z prvního.
- **Aplikace se nesmí připojovat jako vlastník tabulek.** Vlastník RLS obchází. Aplikace
  dostane vlastní roli s právy jen na to, co má.
- **Přenést i granty, ne jen schéma.** Poučení z migrace 0021: tabulkové právo přebíjí
  sloupcové. Pravidlo `revoke … from anon, authenticated` platí dál v jiné podobě.
- **Kód karty.** Formát v personalistice nemusí odpovídat tomu, co čte čtečka. Ověřit
  před stavbou párování (bod 6 výš).
- **Express nemá Agenta.** Kdyby SQL Server byl Express, noční plánovač spouští Task
  Scheduler, ne databáze.
- **Podpisový klíč relace je stejně citlivý jako servisní klíč.** Kdo ho drží, vydá si
  libovolnou identitu. Patří výhradně na server, do přihlašovací cesty, nikdy do gitu.

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

---

## Odkazy

- `docs/PORTABILITA.md` — co bylo pro přesun připravené a proč (původní rozvaha z 12. 8.)
- `docs/PROVOZ.md` — zálohy, osobní údaje, prostředí
- Pokus s vlastním přihlášením nad Supabase (28. 8. 2026) prokázal, že oprávnění
  v databázi platí nad vlastním tokenem stejně jako nad původním — pro cestu P je to
  přímo použitelné, pro M je to důkaz principu.
