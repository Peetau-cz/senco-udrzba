# Přenositelnost: co obnáší přesun mimo Supabase

Rozhodnutí (12. 8. 2026): **zůstáváme v Supabase Cloud**, ale schéma je připravené tak,
aby přesun na firemní PostgreSQL byl proveditelný. Motivací je úspora nákladů, termín
je neurčitý.

Tento dokument popisuje, co by přesun stál a co je pro něj už hotové.

---

## Kolik se vlastně ušetří

Supabase Pro vyjde zhruba na 25 USD měsíčně, tedy něco přes 600 Kč. Proti tomu stojí
čas někoho z IT na provoz, zálohy, aktualizace a řešení výpadků. Server sice „už
platíme", ale hodiny správce ne.

Doporučení proto zní: **přesouvat jen tehdy, když se objeví jiný důvod než cena** —
například požadavek, aby data nesměla opustit firmu.

---

## Dvě různé cesty

Pod „přesunem na vlastní Postgres" se skrývají dvě dost odlišné věci.

### A) Self-hosted Supabase u vás — doporučená cesta

Celý stack (PostgreSQL, GoTrue pro přihlašování, PostgREST, Storage, Realtime) běží
v Dockeru na vašem serveru.

- **Kód aplikace se nemění ani o řádek.** Změní se hodnoty v `.env.local`.
- Migrace se nahrají obě, stejně jako dnes.
- Potřebuje: server s Dockerem a někoho, kdo bude stack spravovat a aktualizovat.

Odhad: dny práce, převážně na straně IT.

### B) Holý PostgreSQL bez Supabase

Schéma se přenese, ale musíte nahradit čtyři věci:

| Co | Dnes | Náhrada |
|---|---|---|
| Přihlašování | Supabase Auth (GoTrue) | vlastní řešení, např. Auth.js |
| Přístup k datům | supabase-js přes PostgREST | Drizzle nebo Kysely přímo na Postgres |
| Soubory | Supabase Storage | MinIO nebo souborový systém |
| Realtime | Supabase Realtime | SSE nebo prosté dotazování |

Odhad: týdny práce. Autentizace je z toho zdaleka největší kus — a stěhování
existujících uživatelů a hesel je ta nejnepříjemnější část.

---

## Co je pro přesun už hotové

### Schéma je rozdělené na jádro a adaptér

| Soubor | Obsah | Závislost na Supabase |
|---|---|---|
| `supabase/migrations/0001_identita_a_opravneni.sql` | tabulky, výčty, RLS politiky, audit, pomocné funkce | **žádná** — čistý PostgreSQL |
| `supabase/migrations/0002_napojeni_na_supabase_auth.sql` | napojení identity, zakládání profilu | jediný závislý soubor |

Migrace 0001 se nasadí i na holý PostgreSQL server. Sama si vytvoří role `anon`
a `authenticated`, pokud tam ještě nejsou.

### Šev: funkce `public.aktualni_uzivatel()`

Jediné místo, kde se schéma ptá, kdo je přihlášený uživatel. Všech deset RLS politik
i auditní trigger volají tuto funkci, nikoli `auth.uid()` přímo.

```sql
-- 0001: přenositelná varianta - aplikace nastaví proměnnou spojení
select nullif(current_setting('app.uzivatel_id', true), '')::uuid;

-- 0002: varianta pro Supabase - identita přichází v JWT
select auth.uid();
```

Přechod na jiné přihlašování je tedy **změna jedné funkce**, ne přepisování politik.
Aplikace by na holém Postgresu musela po navázání spojení nastavit
`set_config('app.uzivatel_id', <id>, true)`.

### `profil` není svázaný s `auth.users`

Tabulka `profil` záměrně **nemá cizí klíč** do `auth.users`. Identifikátor dodává systém
přihlašování; pod Supabase jej doplní trigger z migrace 0002. Doménový model tím
nezávisí na schématu `auth`, které na holém Postgresu neexistuje.

---

## Co se nepřenese samo

Tohle je potřeba vědět dopředu, protože se to bude týkat modulu M1:

- **Fotografie a návody.** Modul M1 je ukládá do Supabase Storage. Aby přesun zůstal
  levný, chodí se k nim přes vlastní rozhraní v `src/lib/storage/` — hotovo v M1, včetně
  překladu chybových hlášek úložiště. Přímé volání Storage ze stránek nikde nezůstalo.
- **Realtime.** Dashboard se má obnovovat bez načtení stránky. Na holém Postgresu by to
  znamenalo SSE nebo dotazování v intervalu.
- **Plánovač.** `pg_cron` je rozšíření PostgreSQL, funguje i mimo Supabase — ale na
  firemním serveru jej musí někdo povolit.

---

## Pravidla, která přenositelnost udržují

1. Nové politiky volají `public.aktualni_uzivatel()`, nikdy `auth.uid()` přímo.
2. Cokoli specifického pro Supabase patří do samostatné migrace, ne mezi tabulky.
3. Do `profil` a dalších doménových tabulek nepatří cizí klíče do schématu `auth`.
4. Dotazy do databáze zůstávají v datové vrstvě (`src/lib/auth/session.ts` a později
   `src/lib/data/`), ne roztroušené po komponentách. Při výměně supabase-js se pak mění
   jedno místo.
5. Práci se soubory schovat za vlastní rozhraní (platí od M1).

Když se tato pravidla dodrží, zůstane varianta A prakticky zdarma a varianta B
zvládnutelná.
