# Plán dokončení přesunu a dílny na tabletu

Schváleno 25. 9. 2026. Pořadí a obsah prací od prvního spuštění na `Udrzba_dev` po hotový
web na SQL Serveru a přihlášení dílny na tabletu — backend (SQL) i frontend (Next.js).
Proč přesun a jak vypadá cílový stav: `docs/NASAZENI.md`; přihlášení dílny: `docs/NAVRH.md`
kap. 8 (M7). Tenhle soubor se odškrtává po kolech.

**Rozhodnuto (25. 9. 2026):**

- **Kancelář a garanti:** přihlášení e-mailem (nebo jeho částí před @) a **heslem ze ZAKMATu**.
  Algoritmus známe (PBKDF2-SHA256, 500 iterací), kódování hesla zjistíme zkouškou na vlastním
  účtu uživatele, Delphi kód není potřeba. Vývoj a e2e testy používají vlastní heslo
  (`prihlaseni`, seedové účty), přepíná `PRIHLASENI_ZDROJ=zakmat|vlastni`.
- **Dílna:** registrovaný tablet, výběr jména, vlastní PIN ověřovaný uvnitř databáze
  (NAVRH kap. 8). Tablet používá **stejné obrazovky v jiném rámu** (bez bočního menu).
- **Karty a role `kiosek` zanikají.** Tisk protokolů vyřazen. **QR štítky až jako nadstavba
  po spuštění:** stroje už nějaké QR štítky mají, ale není jasné, co kódují — zjistit a napojit
  na běžící web (sken → karta stroje, nový zásah).
- **Do `main` až funguje celý web na SQL Serveru** (konec R8). Do té doby `main` drží
  funkční verzi nad Supabase.

## Vydání 1 — co musí mít, aby se začalo používat

Rozhodnuto 25. 9. 2026 (nadřízení tlačí na vydání): **celý dnešní web + tablety pro dílnu**,
na ostré databázi `Udrzba` (instance ZAKMAT). Server domluvený, stroje a šablony zadají garanti
ručně v aplikaci.

| Musí mít                | Obsah                                                                                                                                                     |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Celý web na SQL Serveru | K0–R8: všechny obrazovky M0–M6, přihlášení heslem ze ZAKMATu, soubory, plánovač                                                                           |
| Tablety (jádro M7)      | registrace tabletu, přihlášení jménem + PINem, rám bez menu, odhlášení po 5 min, „Moje práce", admin nastaví / odemkne PIN, vynucená změna dočasného PINu |
| Nasazení                | loginy a migrace na ostré `Udrzba`, web na serveru jako služba za HTTPS, noční úloha, adresář fotek v zálohách, první admin                               |
| Návod                   | jedna strana pro dílnu (tablet, PIN, checklist) a jedna pro garanty                                                                                       |

**Evidence strojů začíná znovu** (rozhodnuto 25. 9.): ve firmě už nějaká evidence zařízení
v databázi je, ale pro Údržbu se nepřebírá. Garanti ale mají **zadávat stejné inventární
číslo** jako v dosavadní evidenci — podle něj se později napojí QR štítky nebo import.

**Až po vydání 1:** přidat osobu ze ZAKMATu výběrem (zatím ručně s osobním číslem, obrazovka
existuje), změna PINu kdykoli z menu (vynucená změna při prvním přihlášení zůstává), QR štítky,
import CSV, e-mailové notifikace.

**Od IT k serveru potřebuji:** název serveru a adresu webu, jestli je tam Node.js LTS, jak se
spouští služba (NSSM / IIS), certifikát HTTPS, cestu k adresáři na fotky (v zálohách).

**Odhad:** ~4 týdny práce od dodání databází (R3–R8 2–3 týdny, M7 ~1 týden, nasazení 2–3 dny).

## Pořadí prací

| Kolo | Co                                                                   | Kdy                      |
| ---- | -------------------------------------------------------------------- | ------------------------ |
| K0   | úprava schématu (tablet, PIN, pryč karty)                            | **teď, naslepo**         |
| K1   | první spuštění na `Udrzba_dev`, oprava R1–R2 do zelena               | den, kdy je DB           |
| R3   | řádková práva a granty                                               | naslepo teď, ověřit v K1 |
| R4   | datová vrstva, přihlášení, `proxy.ts`, první obrazovky               | po K1                    |
| R5   | zbylé obrazovky, jedna oblast za commit                              |                          |
| R6   | soubory na disku                                                     |                          |
| R7   | noční plánovač                                                       |                          |
| R8   | úklid Supabase, dokumenty, PR do `main`                              |                          |
| M7   | tablet: registrace, přihlášení PINem, rám, „Moje práce", správa PINů | po R8                    |
| V1   | nasazení na ostrou `Udrzba`, návody, **vydání 1**                    | po M7                    |

Každé kolo = commit(y) na `presun-sql-server`; před commitem `npm test`, `typecheck`,
`lint`, `mssql:syntaxe`, s databází i `mssql:migrace && mssql:testy`.

## K0 — úprava schématu (naslepo, tento týden) — **napsáno 25. 9.**, ověří K1

`0001` ještě nikde neběželo, upravuje se přímo:

- **pryč:** tabulka `karta`, procedury `osoba_podle_karty` / `_osobniho_cisla`, role `kiosek`
  (seed `01_ciselniky`), osoba 9001 a karty v `scripts/lib/osoby-seed.mjs`, audit `karta`
  v `0003`, testy karet v `schema.sql` a `procedury.sql`;
- **nové tabulky:** `tablet` (id, nazev, token_hash `varbinary(32)` unikátní, aktivni,
  vytvoril_id, naposledy_at) a `pin` (profil_id PK, sul, hash `varbinary(64)`, musi_zmenit,
  chyb, zamceno_do, zamceno_trvale, zmeneno_at) + tabulka `pokus_hesla` pro zámek přihlášení
  heslem (jmeno, chyb, zamceno_do);
- **nové procedury (0004):** `zaregistruj_tablet`, `zrus_tablet` (admin), `seznam_pro_tablet
@token` (jména s rolí a PINem; EXECUTE AS OWNER — před přihlášením RLS nikoho nepustí),
  `prihlas_pinem @token, @osoba, @pin` (tablet + zámek + `HASHBYTES` SHA2-512 v jedné
  transakci), `nastav_pin` (admin, dočasný), `zmen_pin` (osoba, starý + nový), `odemkni_pin`
  (admin), funkce `je_slaby_pin`; `osoba_pro_prihlaseni @osobni_cislo` (po ověření hesla
  ze ZAKMATu: aktivní osoba s rolí);
- **test:** `mssql/testy/pin.sql` — neregistrovaný tablet odmítnut, 5 chyb = 15 min, 10 =
  natrvalo, správný PIN vynuluje, slabý PIN odmítnut, `musi_zmenit` po `nastav_pin`.

## K1 — první spuštění (den, kdy je DB)

Uživatel: loginy na TEST (`senco_udr_test` v `db_owner`, `udrzba_app`, `udrzba_planovac`,
`udrzba_app` SELECT na `UZIVATEL` v kopii ZAKMATu), `.env.local`, název kopie ZAKMATu.
Já: `mssql:prozkoumej`, `mssql:migrace`, `mssql:seed`, `mssql:testy` → opravy, dokud
nejsou všechny testy zelené. **Zkouška hesla:** uživatel zadá své heslo do malého skriptu,
který zkusí UTF-8 / UTF-16LE / CP1250 proti jeho hashi v ZAKMATu — výsledek určí kódování.

## R3 — řádková práva a granty (`0006_prava.sql`)

- schéma `bezpecnost`, jeden predikát (inline TVF, schemabound) na tabulku, výjimka
  `IS_MEMBER('db_owner')`; `SECURITY POLICY` s FILTER a BLOCK (AFTER INSERT, AFTER UPDATE,
  BEFORE UPDATE, BEFORE DELETE) přesně podle inventury politik PostgreSQL (22 tabulek);
- granty pro `udrzba_app` podle inventury: tabulkové, **sloupcové UPDATE** (zakazka,
  zakazka_ukon, provozni_denik, fotky), bez práva tam, kde PG nemělo politiku (DELETE na
  zakazka / provozni_denik / profil / plan_udrzby, audit jen SELECT); `tablet`, `pin`,
  `prihlaseni`, `pokus_hesla` **žádné právo**; EXECUTE jen na procedury volané z aplikace;
  SELECT na pohledy; `udrzba_planovac` jen `spust_planovac`;
- INSERT bez sloupcového grantu: `vytvoreno_at` a `zapsal_id` hlídá razítko / default;
- test `prava.sql` pod `EXECUTE AS USER = 'udrzba_app'`: převod `rls.sql`, `prava_zakazek.sql`,
  grantových kontrol z `denik.sql` a `historie.sql` (č. 7); **ověří obě otevřené otázky**
  (razítko pod RLS, pomocné funkce pod RLS).

## R4 — základ aplikace a přihlášení

- `src/lib/db/`: Kysely + tedious (už v závislostech), `sIdentitou(osobaId, fn)` (transakce,
  `SESSION_CONTEXT`, vynulování), `bezIdentity(fn)` pro přihlášení; typy tabulek
  (`npm run mssql:typy` z `sys.columns`); napojit hotové `chyby.ts` a `hodnoty.ts`;
- `relace.ts`: payload + druh (`heslo` / `tablet`) a id tabletu; `session.ts` čte relaci →
  profil, role, oblasti; kontrola `aktivni`, `relace_platne_od`, aktivního tabletu;
- `src/proxy.ts` místo `middleware.ts` (jen podpis cookie, přesměrování na `/login`);
- přihlášení: pole „E-mail nebo jméno" + heslo; `overovatel.ts` dvě implementace
  (`zakmat` = PBKDF2 nad `HE_SALTB64/HE_HASHB64`, aktivní uživatel, `HE_ALG`; `vlastni` =
  scrypt z `prihlaseni`), zámek přes `pokus_hesla`, atrapa hashe u neznámého jména;
- první řez: zařízení, typy, umístění (dotazy + akce na Kysely);
- e2e `prihlaseni.spec.ts` zelený (vlastní heslo, seedové účty).

## R5 — zbylé obrazovky (commit na oblast)

Pořadí: šablony → plán a zakázky → plnění, dashboard, export → deník a historie → audit →
osoby, oblasti, role → druhy zásahu. Vzor v každé oblasti:

- dotazy v `src/lib/*/dotazy.ts` a akce v `actions.ts` na Kysely uvnitř `sIdentitou`;
  **návratové typy zůstávají** (obrazovky se nemění);
- vnořené selecty → JOIN nebo druhý dotaz; `x(count)` → poddotaz; `rpc` → `exec` procedury;
- id nových řádků z aplikace (`randomUUID`), žádné `.returning()`;
- místní `prelozChybu` → jedno `chyby.ts`; „0 řádků = bez práva" → `overZmenu`;
- osoby: pryč karty (`sparujKartu`, `FormularKarty`, `jeKiosek`, sekce Kiosky).

## R6–R8

- **R6 soubory:** `src/lib/storage` na disk (`SOUBORY_ADRESAR`), stejné tři funkce;
  route handler `/soubory/[nadoba]/[...cesta]` s pravidly podle inventury (čtení = vidí
  oblast; zápis = zařízení: správce, zakázky: provádí údržbu a zakázka otevřená, deník:
  okno na opravu).
- **R7 plánovač:** úloha Agenta (`mssql/agent/planovac_job.sql`) nebo Plánovač úloh
  Windows + `npm run planovac` → `exec dbo.spust_planovac`.
- **R8 úklid:** smazat `supabase/`, `@supabase/*`, `database.types.ts`, `seed-users.mjs`,
  `overit-rls.mjs`, `db:*` skripty; README, NAVRH, PROVOZ; e2e; **PR do `main`**.

## M7 — dílna na tabletu

- `/nastaveni/tablety` (admin): seznam, zrušení; na tabletu „Zaregistrovat tento tablet" →
  `zaregistruj_tablet` + dlouhodobá httpOnly cookie zařízení;
- `/tablet`: dlaždice se jmény (`seznam_pro_tablet`), hledání, naposledy přihlášení nahoře
  (localStorage), číselná klávesnice PINu → `prihlas_pinem` → relace druhu `tablet`
  (**5 min nečinnosti**, rozhodnuto 25. 9.; prodlužuje se aktivitou, 30 s předem výzva
  „Klepněte pro pokračování", odpočet stojí, dokud je otevřený fotoaparát nebo se nahrává
  fotka); bez cookie tabletu stránka nic neukáže;
- **rám tabletu** v `(aplikace)/layout.tsx`: místo bočního menu horní lišta (jméno, Moje
  práce, Nový zásah, Změnit PIN, **Hotovo – odhlásit**), odpočet nečinnosti na klientu;
- „Moje práce": dnešní a zpožděné zakázky své profese ve svých oblastech + volné
  (rozšíření `/plan`), checklist a deník beze změny;
- PIN: na kartě osoby „Nastavit PIN" a „Odemknout" (admin), při prvním přihlášení vynucená
  změna, stránka „Změnit PIN";
- osoby ze ZAKMATu: v `/nastaveni/uzivatele` „Přidat ze ZAKMATu" (hledání v aktivních
  `UZIVATEL`, převezme jméno, osobní číslo, e-mail) → role a oblasti jako dnes;
- nové UI prvky: mřížka dlaždic, číselná klávesnice, pole hledání;
- e2e projekt `tablet`: bez registrace nic, špatný PIN 5× zamkne, přihlášení a odhlášení
  po nečinnosti, v auditu je osoba.

## Co musí zařídit uživatel

| Kdy      | Co                                                             |
| -------- | -------------------------------------------------------------- |
| před K1  | loginy na TEST, `.env.local`, název kopie ZAKMATu              |
| K1       | zadat své heslo do zkušebního skriptu (kódování hesla ZAKMATu) |
| před M7  | tablety (Android, Chrome, fotoaparát), Wi-Fi v hale (IT)       |
| průběžně | schválení po kolech; merge do `main` až po R8                  |

## Ověření

Po každém kole zelené: `npm test`, `typecheck`, `lint`, `mssql:syntaxe`, s DB `mssql:testy`.
R4: e2e přihlášení. R5: ruční průchod obrazovky oblasti + e2e tam, kde existuje. R8: celý
e2e (chromium + tablet) proti `Udrzba_dev`, build. M7: e2e `tablet`.
