-- =============================================================================
-- Ověření pohledu v_pripravenost_zarizeni (migrace 0019).
--
-- Pohled má odhalit stroje, kterým se údržba nikdy nenaplánuje. Test staví
-- čtyři stroje, každý v jednom ze stavů, a ověřuje, že je pohled rozliší:
--
--   * bez_sablony  - stroj nemá přiřazenou žádnou šablonu
--   * bez_ukonu    - šablonu má, ale ta nemá platnou verzi, plán je prázdný
--   * bez_terminu  - plán je, ale u části úkonů chybí `dalsi_termin`
--   * ok           - všechny aktivní úkony mají termín
--
-- Navíc ověřuje čtyři věci, které nejsou vidět na číslech:
--   * pohled má security_invoker, jinak by obcházel RLS,
--   * kontrolují se jen stroje V PROVOZU - vyřazený, odstavený ani stroj
--     v opravě se v pohledu neobjeví, protože se u nich dnes stejně nedá nic
--     naplánovat a výstraha by byla jen šum,
--   * úkon vyřazený z matice (aktivni = false) chybějícím termínem nevadí.
--
-- Test si zakládá VLASTNÍ OBLAST, aby se do výsledků nemíchaly skutečné
-- stroje, u kterých se stav plánu mění podle toho, co kdo zrovna vyplnil.
--
-- Spuštění: v SQL editoru Supabase nebo přes psql, pod rolí postgres.
-- Předpoklad: proběhly migrace 0001-0019 a seed.sql.
--
-- Skript nic nemění - celý běží v transakci, která se na konci vrací.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Část 1: pohled nesmí obcházet RLS
-- -----------------------------------------------------------------------------

do $$
declare
  v_moznost text[];
begin
  select c.reloptions into v_moznost
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'v_pripravenost_zarizeni';

  if v_moznost is null or not ('security_invoker=true' = any (v_moznost)) then
    raise exception
      'v_pripravenost_zarizeni nemá security_invoker = true, obchází RLS.';
  end if;

  raise notice 'Pohled má security_invoker, RLS se vyhodnotí za volajícího.';
end;
$$;

-- -----------------------------------------------------------------------------
-- Část 2: čtyři stavy nad připravenými daty
-- -----------------------------------------------------------------------------

do $$
declare
  v_oblast   uuid;
  v_profese  uuid;
  v_typ      uuid;
  v_bez_sabl uuid;
  v_bez_ukon uuid;
  v_bez_term uuid;
  v_ok       uuid;
  v_vyrazeny uuid;
  v_v_oprave uuid;
  v_odstaveny uuid;
  v_sablona  uuid;
  v_prazdna  uuid;
  v_verze    uuid;
  v_radek    record;
  v_pocet    integer;
  v_kontrol  integer := 0;
begin
  select id into v_profese from public.role where kod = 'specialista_cnc';
  if v_profese is null then
    raise exception 'Chybí číselníky. Spusťte nejdřív supabase/seed.sql';
  end if;

  insert into public.oblast (kod, nazev, poradi)
  values ('test_pripravenost', 'Testovací oblast pro připravenost', 98)
  returning id into v_oblast;

  insert into public.typ_zarizeni (oblast_id, kod, nazev)
  values (v_oblast, 'test_typ_pripr', 'Testovací typ pro připravenost')
  returning id into v_typ;

  -- Šablona se dvěma úkony, aby šlo jednomu termín dát a druhému nechat prázdný.
  insert into public.sablona (oblast_id, kod, nazev)
  values (v_oblast, 'test_pripravenost', 'Testovací šablona pro připravenost')
  returning id into v_sablona;

  v_verze := public.zaloz_navrh_verze(v_sablona);

  insert into public.sablona_ukon (
    sablona_verze_id, poradi, nazev, interval_typ, interval_hodnota,
    interval_zaklad, profese_role_id
  ) values
    (v_verze, 1, 'Úkon s termínem',  'tydny', 1, 'od_planu', v_profese),
    (v_verze, 2, 'Úkon bez termínu', 'tydny', 2, 'od_planu', v_profese);

  perform public.aktivuj_verzi(v_verze);

  -- Druhá šablona schválně ZŮSTÁVÁ v návrhu: přiřazení stroji tedy nezaloží
  -- žádný řádek plánu a vznikne stav bez_ukonu.
  insert into public.sablona (oblast_id, kod, nazev)
  values (v_oblast, 'test_pripravenost_navrh', 'Šablona bez platné verze')
  returning id into v_prazdna;

  perform public.zaloz_navrh_verze(v_prazdna);

  -- Stroje ---------------------------------------------------------------------
  insert into public.zarizeni (oblast_id, typ_zarizeni_id, nazev, inventarni_cislo)
  values (v_oblast, v_typ, 'Stroj bez šablony', 'TEST-PRIPR-1')
  returning id into v_bez_sabl;

  insert into public.zarizeni (oblast_id, typ_zarizeni_id, nazev, inventarni_cislo)
  values (v_oblast, v_typ, 'Stroj se šablonou bez verze', 'TEST-PRIPR-2')
  returning id into v_bez_ukon;

  insert into public.zarizeni (oblast_id, typ_zarizeni_id, nazev, inventarni_cislo)
  values (v_oblast, v_typ, 'Stroj s chybějícím termínem', 'TEST-PRIPR-3')
  returning id into v_bez_term;

  insert into public.zarizeni (oblast_id, typ_zarizeni_id, nazev, inventarni_cislo)
  values (v_oblast, v_typ, 'Stroj s dodělaným plánem', 'TEST-PRIPR-4')
  returning id into v_ok;

  insert into public.zarizeni (oblast_id, typ_zarizeni_id, nazev, inventarni_cislo, stav)
  values (v_oblast, v_typ, 'Vyřazený stroj', 'TEST-PRIPR-5', 'vyrazeno')
  returning id into v_vyrazeny;

  -- Stroj v opravě a odstavený stroj, oba schválně BEZ šablony: kdyby je pohled
  -- bral, hlásil by nejhorší stav u strojů, se kterými se dnes nedá nic dělat.
  insert into public.zarizeni (oblast_id, typ_zarizeni_id, nazev, inventarni_cislo, stav)
  values (v_oblast, v_typ, 'Stroj v opravě', 'TEST-PRIPR-6', 'v_oprave')
  returning id into v_v_oprave;

  insert into public.zarizeni (oblast_id, typ_zarizeni_id, nazev, inventarni_cislo, stav)
  values (v_oblast, v_typ, 'Odstavený stroj', 'TEST-PRIPR-7', 'odstaveno')
  returning id into v_odstaveny;

  -- Přiřazení šablon. Trigger z migrace 0010 založí řádky plánu bez termínu.
  insert into public.zarizeni_sablona (zarizeni_id, sablona_id, oblast_id)
  values
    (v_bez_ukon, v_prazdna, v_oblast),
    (v_bez_term, v_sablona, v_oblast),
    (v_ok,       v_sablona, v_oblast),
    (v_vyrazeny, v_sablona, v_oblast);

  -- Termíny: stroji „ok" oběma úkonům, stroji „bez_terminu" jen prvnímu.
  update public.plan_udrzby set dalsi_termin = current_date + 7
  where zarizeni_id = v_ok;

  update public.plan_udrzby set dalsi_termin = current_date + 7
  where zarizeni_id = v_bez_term
    and ukon_klic = (
      select ukon_klic from public.plan_udrzby
      where zarizeni_id = v_bez_term order by ukon_klic limit 1
    );

  -- 1. Stroj bez šablony ------------------------------------------------------
  select * into v_radek from public.v_pripravenost_zarizeni where zarizeni_id = v_bez_sabl;
  if v_radek.stav_planu <> 'bez_sablony' then
    raise exception 'Stroj bez šablony má stav %, čekal se bez_sablony.', v_radek.stav_planu;
  end if;
  if v_radek.sablon <> 0 or v_radek.ukonu_celkem <> 0 then
    raise exception 'Stroj bez šablony má % šablon a % úkonů, čekaly se nuly.',
      v_radek.sablon, v_radek.ukonu_celkem;
  end if;
  v_kontrol := v_kontrol + 1;

  -- 2. Šablona bez platné verze -----------------------------------------------
  select * into v_radek from public.v_pripravenost_zarizeni where zarizeni_id = v_bez_ukon;
  if v_radek.stav_planu <> 'bez_ukonu' then
    raise exception 'Stroj se šablonou bez verze má stav %, čekal se bez_ukonu.',
      v_radek.stav_planu;
  end if;
  if v_radek.sablon <> 1 then
    raise exception 'Šablona se má počítat i bez platné verze, napočítáno %.', v_radek.sablon;
  end if;
  v_kontrol := v_kontrol + 1;

  -- 3. Chybějící termín u části úkonů -----------------------------------------
  select * into v_radek from public.v_pripravenost_zarizeni where zarizeni_id = v_bez_term;
  if v_radek.stav_planu <> 'bez_terminu' then
    raise exception 'Stroj s chybějícím termínem má stav %, čekal se bez_terminu.',
      v_radek.stav_planu;
  end if;
  if v_radek.ukonu_celkem <> 2 or v_radek.ukonu_bez_terminu <> 1 then
    raise exception 'Čekal se 1 úkon bez termínu ze 2, je jich % z %.',
      v_radek.ukonu_bez_terminu, v_radek.ukonu_celkem;
  end if;
  v_kontrol := v_kontrol + 1;

  -- 4. Dodělaný plán ----------------------------------------------------------
  select * into v_radek from public.v_pripravenost_zarizeni where zarizeni_id = v_ok;
  if v_radek.stav_planu <> 'ok' then
    raise exception 'Stroj s dodělaným plánem má stav %, čekalo se ok.', v_radek.stav_planu;
  end if;
  v_kontrol := v_kontrol + 1;

  -- 5. Vyřazený stroj v pohledu není -------------------------------------------
  select count(*) into v_pocet
  from public.v_pripravenost_zarizeni where zarizeni_id = v_vyrazeny;
  if v_pocet <> 0 then
    raise exception 'Vyřazený stroj se do pohledu nemá dostat, je tam %krát.', v_pocet;
  end if;
  v_kontrol := v_kontrol + 1;

  -- 6. Stroj v opravě v pohledu taky není --------------------------------------
  select count(*) into v_pocet
  from public.v_pripravenost_zarizeni where zarizeni_id = v_v_oprave;
  if v_pocet <> 0 then
    raise exception 'Stroj v opravě se do pohledu nemá dostat, je tam %krát.', v_pocet;
  end if;
  v_kontrol := v_kontrol + 1;

  -- 7. Odstavený stroj v pohledu taky není -------------------------------------
  --
  -- Odstavený stroj se dnes plánovat nedá stejně jako ten v opravě. Až se vrátí
  -- do provozu, výstraha se objeví sama - stav se počítá živě, nic se neztratí.
  select count(*) into v_pocet
  from public.v_pripravenost_zarizeni where zarizeni_id = v_odstaveny;
  if v_pocet <> 0 then
    raise exception 'Odstavený stroj se do pohledu nemá dostat, je tam %krát.', v_pocet;
  end if;
  v_kontrol := v_kontrol + 1;

  -- 8. Vyřazený úkon chybějícím termínem nevadí --------------------------------
  --
  -- Úkon, který garant z matice vyhodil novou verzí, drží řádek dál kvůli
  -- poslednímu provedení, ale plánovat se už nemá. Kdyby ho pohled počítal,
  -- hlásil by výstrahu u stroje, na kterém není co dodělat.
  update public.plan_udrzby
  set aktivni = false, dalsi_termin = null
  where zarizeni_id = v_ok
    and ukon_klic = (
      select ukon_klic from public.plan_udrzby
      where zarizeni_id = v_ok order by ukon_klic limit 1
    );

  select * into v_radek from public.v_pripravenost_zarizeni where zarizeni_id = v_ok;
  if v_radek.stav_planu <> 'ok' then
    raise exception 'Vyřazený úkon bez termínu nemá dělat výstrahu, stav je %.',
      v_radek.stav_planu;
  end if;
  if v_radek.ukonu_celkem <> 1 then
    raise exception 'Po vyřazení úkonu měl zbýt 1 aktivní, je jich %.', v_radek.ukonu_celkem;
  end if;
  v_kontrol := v_kontrol + 1;

  raise notice 'Test připravenosti prošel: všech % kontrol v pořádku.', v_kontrol;
end;
$$;

rollback;
