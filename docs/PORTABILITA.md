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
| `0003`, `0005`–`0011` | zařízení, šablony, plán, zakázky | **žádná** — čistý PostgreSQL |
| `supabase/migrations/0002_napojeni_na_supabase_auth.sql` | napojení identity, zakládání profilu | závislý |
| `supabase/migrations/0004_uloziste_zarizeni.sql` | nádoba na fotky a návody ke strojům | závislý |
| `supabase/migrations/0012_uloziste_zakazek.sql` | nádoba na fotodokumentaci údržby | závislý |
| `supabase/migrations/0024_osoba_bez_uctu.sql` | osoba bez účtu, karty, identifikace | **žádná** — čistý PostgreSQL |
| `supabase/migrations/0025_napojeni_uctu_na_osobu.sql` | překlad účtu na osobu, napojení účtu | závislý |

Migrace 0001 se nasadí i na holý PostgreSQL server. Sama si vytvoří role `anon`
a `authenticated`, pokud tam ještě nejsou. Závislé soubory jsou tři a všechny
tři jsou adaptéry — dva na úložiště, jeden na přihlašování. Doménové tabulky
mezi nimi nejsou žádné.

### Šev: funkce `public.aktualni_uzivatel()`

Jediné místo, kde se schéma ptá, kdo je přihlášený uživatel. Všech deset RLS politik
i auditní trigger volají tuto funkci, nikoli `auth.uid()` přímo.

```sql
-- 0001: přenositelná varianta - aplikace nastaví proměnnou spojení
select nullif(current_setting('app.uzivatel_id', true), '')::uuid;

-- 0002: varianta pro Supabase - identita přichází v JWT
select auth.uid();

-- 0025: účet už není totéž co osoba, takže se musí přeložit
select p.id from public.profil p where p.ucet_id = auth.uid();
```

Přechod na jiné přihlašování je tedy **změna jedné funkce**, ne přepisování politik.
Aplikace by na holém Postgresu musela po navázání spojení nastavit
`set_config('app.uzivatel_id', <id>, true)` — a od 0024 tam patří **id osoby**,
protože přenositelná varianta překlad nedělá.

Že se to celé svedlo na jednu funkci, se vyplatilo v M6: rozdělení osoby a účtu
se v politikách neprojevilo ani jedním znakem.

### Osoba a účet jsou dvě různé věci (od migrace 0024)

`profil` znamená **osobu**. Účet je jen jedna z jejích vlastností — sloupec `ucet_id`,
a u většiny lidí je prázdný. Vyplynulo to z provozu: mail má jen garant oddělení,
technici v dílně žádný nemají a k identifikaci jim slouží karta na turniket.

Důsledek pro aplikaci: `supabase.auth.getUser()` vrací **id účtu**, které se nesmí
zapsat do sloupců jako `dokoncil_id` nebo `provedl_id`. K tomu je
`idPrihlaseneOsoby()` v `src/lib/auth/session.ts`. Nové účty schválně dostávají jiné
`profil.id` než `ucet_id`, aby se ta záměna poznala hned, a ne až v datech.

### `profil` není svázaný s `auth.users`

Tabulka `profil` záměrně **nemá cizí klíč** do `auth.users` — ani přes `id`, ani přes
`ucet_id`. Identifikátor dodává systém přihlašování; pod Supabase jej doplní trigger
z migrace 0002, upravený v 0025. Doménový model tím nezávisí na schématu `auth`,
které na holém Postgresu neexistuje.

---

## Co se nepřenese samo

- **Fotografie a návody.** Modul M1 je ukládá do Supabase Storage. Aby přesun zůstal
  levný, chodí se k nim přes vlastní rozhraní v `src/lib/storage/` — hotovo v M1, včetně
  překladu chybových hlášek úložiště. Přímé volání Storage ze stránek nikde nezůstalo.
- **Fotodokumentace údržby.** M3 přidává druhou nádobu `zakazky` (migrace 0012). Vlastní,
  ne sdílenou s M1: fotka z checklistu a návod ke stroji mají jiný životní cyklus i jiná
  pravidla přístupu, a jedna nádoba by je musela rozplétat podle tvaru cesty.
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
