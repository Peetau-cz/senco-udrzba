-- =============================================================================
-- Ověření výpočtu plnění matice (modul M4, migrace 0017 a 0018).
--
-- Plnění je číslo, na které se bude vedení dívat každý měsíc. Definice, podle
-- které se počítá, není v zadání ani v návrhu - padla rozhodnutím uživatele
-- 19. 8. 2026 a tenhle skript je jediné místo, kde je ověřená proti datům:
--
--   * „Nelze provést" se vyřadí ÚPLNĚ, vykazuje se vedle.
--   * Splněno pozdě není splněno - tolerance je nula.
--   * Tolerance se přesto respektuje, kdyby ji garant někde nastavil.
--   * Období podle plánovaného termínu, ne podle data provedení.
--   * Budoucí termíny se nepočítají ani do jmenovatele.
--   * Zrušená zakázka není nesplněná údržba.
--
-- Test si zakládá VLASTNÍ OBLAST. Pohled agreguje přes celou oblast, takže
-- v CNC by se do čísel míchaly skutečné zakázky a výsledek by závisel na tom,
-- co kdo zrovna odklikal.
--
-- Spuštění: v SQL editoru Supabase nebo přes psql, pod rolí postgres.
-- Předpoklad: proběhly migrace 0006-0018 a seed.sql.
--
-- Skript nic nemění - celý běží v transakci, která se na konci vrací.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Část 1: pohledy nesmí obcházet RLS
--
-- Bez security_invoker se politiky vyhodnocují jménem vlastníka pohledu
-- a kdokoli přihlášený by přes pohled viděl celý podnik. Je to jediná vlastnost
-- těch pohledů, jejíž porušení není vidět na číslech - proto se ověřuje zvlášť.
-- -----------------------------------------------------------------------------

do $$
declare
  v_pohled  text;
  v_moznost text[];
begin
  foreach v_pohled in array array['v_dnesni_plan', 'v_po_terminu', 'v_plneni_matice'] loop
    select c.reloptions into v_moznost
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = v_pohled;

    if v_moznost is null or not ('security_invoker=true' = any(v_moznost)) then
      raise exception 'Pohled % nemá security_invoker - obchází RLS.', v_pohled;
    end if;
  end loop;

  raise notice 'Pohledy plnění: security_invoker v pořádku u všech tří.';
end;
$$;

-- -----------------------------------------------------------------------------
-- Část 2: čísla
-- -----------------------------------------------------------------------------

do $$
declare
  v_oblast  uuid;
  v_profese uuid;
  v_typ     uuid;
  v_stroj   uuid;
  v_sablona uuid;
  v_verze   uuid;
  v_zakazka uuid;
  v_termin  date := date '2026-05-11';
  v_radek   record;
  v_pocet   integer;
  v_kontrol integer := 0;
begin
  select id into v_profese from public.role where kod = 'specialista_cnc';
  if v_profese is null then
    raise exception 'Chybí číselníky. Spusťte nejdřív supabase/seed.sql';
  end if;

  insert into public.oblast (kod, nazev, poradi)
  values ('test_plneni', 'Testovací oblast pro plnění', 99)
  returning id into v_oblast;

  insert into public.typ_zarizeni (oblast_id, kod, nazev)
  values (v_oblast, 'test_typ_plneni', 'Testovací typ pro plnění')
  returning id into v_typ;

  insert into public.zarizeni (oblast_id, typ_zarizeni_id, nazev, inventarni_cislo)
  values (v_oblast, v_typ, 'Testovací stroj pro plnění', 'TEST-PLNENI-1')
  returning id into v_stroj;

  insert into public.sablona (oblast_id, kod, nazev)
  values (v_oblast, 'test_plneni', 'Testovací šablona pro plnění')
  returning id into v_sablona;

  v_verze := public.zaloz_navrh_verze(v_sablona);

  insert into public.sablona_ukon (
    sablona_verze_id, poradi, nazev, interval_typ, interval_hodnota,
    interval_zaklad, profese_role_id
  ) values (v_verze, 1, 'Testovací úkon', 'tydny', 1, 'od_planu', v_profese);

  perform public.aktivuj_verzi(v_verze);

  -- Zakázky se zakládají po jedné a hned uzavírají. Otevřená smí být na stroj,
  -- den, profesi a verzi jen jedna (index z migrace 0013), a krok jde vyplnit
  -- jen dokud je zakázka otevřená (zámek z 0011).

  -- A) splněno v termínu ------------------------------------------------------
  insert into public.zakazka (zarizeni_id, sablona_verze_id, profese_role_id, planovany_termin)
  values (v_stroj, v_verze, v_profese, v_termin) returning id into v_zakazka;

  insert into public.zakazka_ukon (zakazka_id, poradi, nazev_snapshot, stav, potvrzeno_at)
  values (v_zakazka, 1, 'A splněno včas', 'splneno', timestamptz '2026-05-11 09:00+02');

  update public.zakazka set stav = 'dokonceno', dokonceno_at = now() where id = v_zakazka;

  -- B) splněno pozdě ----------------------------------------------------------
  insert into public.zakazka (zarizeni_id, sablona_verze_id, profese_role_id, planovany_termin)
  values (v_stroj, v_verze, v_profese, v_termin) returning id into v_zakazka;

  insert into public.zakazka_ukon (zakazka_id, poradi, nazev_snapshot, stav, potvrzeno_at)
  values (v_zakazka, 1, 'B splněno pozdě', 'splneno', timestamptz '2026-05-20 09:00+02');

  update public.zakazka set stav = 'dokonceno', dokonceno_at = now() where id = v_zakazka;

  -- C) neproveditelné ---------------------------------------------------------
  insert into public.zakazka (zarizeni_id, sablona_verze_id, profese_role_id, planovany_termin)
  values (v_stroj, v_verze, v_profese, v_termin) returning id into v_zakazka;

  insert into public.zakazka_ukon (zakazka_id, poradi, nazev_snapshot, stav, potvrzeno_at, poznamka)
  values (v_zakazka, 1, 'C nelze provést', 'nelze_provest', now(), 'Stroj byl v opravě.');

  update public.zakazka set stav = 'dokonceno', dokonceno_at = now() where id = v_zakazka;

  -- D) splněno pozdě, ale v toleranci ----------------------------------------
  insert into public.zakazka (zarizeni_id, sablona_verze_id, profese_role_id, planovany_termin)
  values (v_stroj, v_verze, v_profese, v_termin) returning id into v_zakazka;

  insert into public.zakazka_ukon (
    zakazka_id, poradi, nazev_snapshot, stav, potvrzeno_at, tolerance_dny_snapshot
  ) values (v_zakazka, 1, 'D v toleranci', 'splneno', timestamptz '2026-05-13 09:00+02', 3);

  update public.zakazka set stav = 'dokonceno', dokonceno_at = now() where id = v_zakazka;

  -- E) zrušená zakázka --------------------------------------------------------
  insert into public.zakazka (zarizeni_id, sablona_verze_id, profese_role_id, planovany_termin)
  values (v_stroj, v_verze, v_profese, v_termin) returning id into v_zakazka;

  insert into public.zakazka_ukon (zakazka_id, poradi, nazev_snapshot)
  values (v_zakazka, 1, 'E zrušeno');

  update public.zakazka set stav = 'zruseno' where id = v_zakazka;

  -- F) rozdělaná, po termínu --------------------------------------------------
  insert into public.zakazka (zarizeni_id, sablona_verze_id, profese_role_id, planovany_termin)
  values (v_stroj, v_verze, v_profese, v_termin) returning id into v_zakazka;

  insert into public.zakazka_ukon (zakazka_id, poradi, nazev_snapshot)
  values (v_zakazka, 1, 'F nevyřízeno');

  -- G) termín v budoucnu ------------------------------------------------------
  insert into public.zakazka (zarizeni_id, sablona_verze_id, profese_role_id, planovany_termin)
  values (v_stroj, v_verze, v_profese, current_date + 10) returning id into v_zakazka;

  insert into public.zakazka_ukon (zakazka_id, poradi, nazev_snapshot)
  values (v_zakazka, 1, 'G ještě nenastalo');

  -- 1. Budoucí termín nezaloží vlastní období --------------------------------
  select count(*) into v_pocet from public.v_plneni_matice where oblast_id = v_oblast;
  if v_pocet <> 1 then
    raise exception 'Období má být jedno (květen), je jich %.', v_pocet;
  end if;
  v_kontrol := v_kontrol + 1;

  select * into v_radek from public.v_plneni_matice where oblast_id = v_oblast;

  -- 2. Období se bere z plánovaného termínu, ne z data provedení -------------
  -- Úkon B se dělal 20. 5., úkon C se potvrzoval dnes. Oba patří do května,
  -- protože na květen byly plánované.
  if v_radek.obdobi <> date '2026-05-01' then
    raise exception 'Období vyšlo na %, čekal se květen 2026.', v_radek.obdobi;
  end if;
  v_kontrol := v_kontrol + 1;

  -- 3. „Nelze provést" je mimo jmenovatel ------------------------------------
  -- Do celkem patří A, B, D a F. C nikoli.
  if v_radek.celkem <> 4 then
    raise exception 'Celkem má být 4, je %.', v_radek.celkem;
  end if;
  v_kontrol := v_kontrol + 1;

  -- 4. ... a vykazuje se vedle ------------------------------------------------
  if v_radek.neprovedeno <> 1 then
    raise exception 'Neprovedeno má být 1, je %.', v_radek.neprovedeno;
  end if;
  v_kontrol := v_kontrol + 1;

  -- 5. Splněno je A (včas) a D (v toleranci), ne B (pozdě) -------------------
  if v_radek.splneno <> 2 then
    raise exception 'Splněno má být 2, je %.', v_radek.splneno;
  end if;
  v_kontrol := v_kontrol + 1;

  -- 6. Po termínu je B (pozdě) a F (nevyřízeno) ------------------------------
  if v_radek.po_terminu <> 2 then
    raise exception 'Po termínu má být 2, je %.', v_radek.po_terminu;
  end if;
  v_kontrol := v_kontrol + 1;

  -- 7. Splněno a po termínu dávají dohromady jmenovatel ----------------------
  -- Kdyby se ty dva sloupce rozešly, plnění by nedávalo sto procent ani při
  -- bezchybném měsíci.
  if v_radek.splneno + v_radek.po_terminu <> v_radek.celkem then
    raise exception 'Splněno + po termínu (%) se nerovná celkem (%).',
      v_radek.splneno + v_radek.po_terminu, v_radek.celkem;
  end if;
  v_kontrol := v_kontrol + 1;

  -- 8. Rozdělaná zakázka po termínu je v přehledu restancí -------------------
  select count(*) into v_pocet
  from public.v_po_terminu where oblast_id = v_oblast and dnu_zpozdeni > 0;
  if v_pocet <> 1 then
    raise exception 'Po termínu má být jedna rozdělaná zakázka, je jich %.', v_pocet;
  end if;
  v_kontrol := v_kontrol + 1;

  -- 9. Budoucí zakázka není ani v dnešním plánu, ani po termínu --------------
  select count(*) into v_pocet
  from public.v_dnesni_plan where oblast_id = v_oblast;
  if v_pocet <> 0 then
    raise exception 'Dnešní plán má být prázdný, je v něm % zakázek.', v_pocet;
  end if;
  v_kontrol := v_kontrol + 1;

  raise notice 'Test plnění prošel: všech % kontrol v pořádku.', v_kontrol;
end;
$$;

rollback;
