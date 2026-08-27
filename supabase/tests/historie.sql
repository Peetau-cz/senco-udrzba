-- =============================================================================
-- Ověření pohledu v_historie_zarizeni (migrace 0023).
--
-- Pohled slévá dva světy do jedné časové osy, a právě proto se u něj dá tiše
-- pokazit víc věcí naráz: přimíchat práci, která se nikdy neudělala, ztratit
-- polovinu osy, nebo přes join vynásobit počty fotek počtem kroků.
--
-- Test staví jeden stroj se čtyřmi událostmi - dokončenou zakázkou, otevřenou
-- zakázkou, zrušenou zakázkou a zápisem v deníku - a ptá se, které z nich
-- v historii jsou a s jakými čísly.
--
-- Navíc ověřuje dvě věci, které na číslech vidět nejsou:
--   * pohled má security_invoker, jinak by přes historii viděl každý celý podnik,
--   * osa jednoho stroje neobsahuje události stroje vedle.
--
-- Spuštění: v SQL editoru Supabase nebo přes psql, pod rolí postgres.
-- Předpoklad: proběhly migrace 0001-0023, seed.sql a přiřazení uživatelů
-- (npm run seed:users, nebo supabase/prirazeni_uzivatelu.sql).
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
  where n.nspname = 'public' and c.relname = 'v_historie_zarizeni';

  if v_moznost is null or not ('security_invoker=true' = any (v_moznost)) then
    raise exception 'v_historie_zarizeni nemá security_invoker = true, obchází RLS.';
  end if;

  raise notice 'Pohled má security_invoker, RLS se vyhodnotí za volajícího.';
end;
$$;

-- -----------------------------------------------------------------------------
-- Část 2: co v historii je a co ne
-- -----------------------------------------------------------------------------

do $$
declare
  v_udrzbar   uuid;
  v_cnc       uuid;

  v_oblast    uuid;
  v_profese   uuid;
  v_typ       uuid;
  v_stroj     uuid;
  v_stroj_b   uuid;

  v_sablona   uuid;
  v_verze     uuid;
  v_plan      uuid;

  v_hotova    uuid;
  v_otevrena  uuid;
  v_zrusena   uuid;
  v_ukon_a    uuid;
  v_ukon_b    uuid;

  v_druh      uuid;
  v_zapis     uuid;

  v_radek     record;
  v_pocet     integer;
  v_kontrol   integer := 0;
begin
  select id into v_udrzbar from auth.users where email = 'udrzbar@senco.test';
  select id into v_cnc     from auth.users where email = 'cnc@senco.test';

  if v_udrzbar is null or v_cnc is null then
    raise exception 'Chybí testovací uživatelé. Spusťte nejdřív: npm run seed:users';
  end if;

  select id into v_oblast  from public.oblast where kod = 'strojni';
  select id into v_profese from public.role   where kod = 'udrzbar';
  select id into v_druh    from public.druh_zasahu where kod = 'vymena_zarovky';

  if v_oblast is null or v_profese is null then
    raise exception 'Chybí číselníky. Spusťte nejdřív supabase/seed.sql';
  end if;

  if v_druh is null then
    raise exception 'Chybí číselník druhů zásahu. Spusťte nejdřív migraci 0020.';
  end if;

  -- Stroje a matice ------------------------------------------------------------
  insert into public.typ_zarizeni (oblast_id, kod, nazev)
  values (v_oblast, 'test_typ_historie', 'Testovací typ pro historii')
  returning id into v_typ;

  insert into public.zarizeni (oblast_id, typ_zarizeni_id, nazev, inventarni_cislo)
  values (v_oblast, v_typ, 'Stroj s historií', 'TEST-HIST-1')
  returning id into v_stroj;

  insert into public.zarizeni (oblast_id, typ_zarizeni_id, nazev, inventarni_cislo)
  values (v_oblast, v_typ, 'Stroj vedle', 'TEST-HIST-2')
  returning id into v_stroj_b;

  insert into public.sablona (oblast_id, kod, nazev)
  values (v_oblast, 'test_historie', 'Testovací šablona pro historii')
  returning id into v_sablona;

  v_verze := public.zaloz_navrh_verze(v_sablona);

  insert into public.sablona_ukon (
    sablona_verze_id, poradi, nazev, interval_typ, interval_hodnota,
    interval_zaklad, profese_role_id
  ) values (v_verze, 1, 'Kontrola hydrauliky', 'tydny', 1, 'od_planu', v_profese);

  perform public.aktivuj_verzi(v_verze);

  insert into public.zarizeni_sablona (zarizeni_id, sablona_id, oblast_id)
  values (v_stroj, v_sablona, v_oblast);

  select id into v_plan from public.plan_udrzby where zarizeni_id = v_stroj;

  -- Dokončená zakázka: dva kroky, jeden splněný, jeden neproveditelný, dvě fotky.
  -- Zakázka se uzavírá až nakonec - po dokončení už do ní nic nepřibude.
  insert into public.zakazka (zarizeni_id, sablona_verze_id, profese_role_id, planovany_termin)
  values (v_stroj, v_verze, v_profese, current_date - 3)
  returning id into v_hotova;

  insert into public.zakazka_ukon (zakazka_id, plan_udrzby_id, poradi, nazev_snapshot)
  values (v_hotova, v_plan, 1, 'Kontrola hydrauliky')
  returning id into v_ukon_a;

  insert into public.zakazka_ukon (zakazka_id, poradi, nazev_snapshot)
  values (v_hotova, 2, 'Kontrola vedení')
  returning id into v_ukon_b;

  update public.zakazka_ukon
  set stav = 'splneno', potvrzeno_at = now() - interval '3 days', potvrdil_id = v_udrzbar
  where id = v_ukon_a;

  update public.zakazka_ukon
  set stav = 'nelze_provest', potvrzeno_at = now() - interval '3 days',
      potvrdil_id = v_udrzbar, poznamka = 'Chyběl díl'
  where id = v_ukon_b;

  insert into public.zakazka_foto (zakazka_ukon_id, storage_path, nahral_id) values
    (v_ukon_a, 'test/historie/foto-1.jpg', v_udrzbar),
    (v_ukon_b, 'test/historie/foto-2.jpg', v_udrzbar);

  update public.zakazka
  set stav = 'dokonceno', dokonceno_at = now() - interval '3 days', dokoncil_id = v_udrzbar
  where id = v_hotova;

  -- Otevřená a zrušená zakázka. Ani jedna do historie nepatří.
  insert into public.zakazka (zarizeni_id, sablona_verze_id, profese_role_id, planovany_termin)
  values (v_stroj, v_verze, v_profese, current_date + 7)
  returning id into v_otevrena;

  insert into public.zakazka (zarizeni_id, sablona_verze_id, profese_role_id, planovany_termin)
  values (v_stroj, v_verze, v_profese, current_date + 14)
  returning id into v_zrusena;

  update public.zakazka set stav = 'zruseno' where id = v_zrusena;

  -- Zápisy v deníku vznikají pod přihlášeným uživatelem: fotku k cizímu zápisu
  -- by trigger ze 0020 nepustil a pod rolí postgres není přihlášený nikdo.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_udrzbar, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  insert into public.provozni_denik (
    zarizeni_id, oblast_id, druh_zasahu_id, popis, provedeno_at, doba_trvani_min
  ) values (
    v_stroj, v_oblast, v_druh, 'Vyměněna žárovka v panelu', now() - interval '1 day', 20
  ) returning id into v_zapis;

  insert into public.denik_foto (zaznam_id, storage_path, nahral_id)
  values (v_zapis, 'test/historie/denik-1.jpg', v_udrzbar);

  -- Zápis u stroje vedle. Do historie prvního stroje se nesmí připlést.
  insert into public.provozni_denik (zarizeni_id, oblast_id, druh_zasahu_id, popis)
  values (v_stroj_b, v_oblast, v_druh, 'Zásah na jiném stroji');

  execute 'reset role';

  -- ---------------------------------------------------------------------------
  -- 1. Dokončená zakázka je v historii se správnými počty
  -- ---------------------------------------------------------------------------
  select * into v_radek
  from public.v_historie_zarizeni
  where zaznam_id = v_hotova;

  if not found then
    raise exception 'Dokončená zakázka v historii chybí.';
  end if;

  if v_radek.puvod <> 'udrzba' then
    raise exception 'Zakázka má původ „%", čekal se udrzba.', v_radek.puvod;
  end if;

  if v_radek.nazev <> 'Testovací šablona pro historii' then
    raise exception 'Zakázka se v ose jmenuje „%", čekal se název šablony.', v_radek.nazev;
  end if;

  if v_radek.ukonu_celkem <> 2 or v_radek.ukonu_splneno <> 1 or v_radek.ukonu_neprovedeno <> 1 then
    raise exception 'Počty kroků nesedí: celkem %, splněno %, neprovedeno %.',
      v_radek.ukonu_celkem, v_radek.ukonu_splneno, v_radek.ukonu_neprovedeno;
  end if;

  -- Nejčastější past u téhle stavby: join na kroky a na fotky zároveň, který
  -- počty vynásobí. Dvě fotky u dvou kroků by pak vyšly jako čtyři.
  if v_radek.fotek <> 2 then
    raise exception 'U zakázky je napočítáno % fotek, čekaly se 2.', v_radek.fotek;
  end if;
  v_kontrol := v_kontrol + 1;

  -- ---------------------------------------------------------------------------
  -- 2. Otevřená zakázka v historii není
  --    Je to práce, která se má teprve udělat - patří do plánu, ne do historie.
  -- ---------------------------------------------------------------------------
  select count(*) into v_pocet
  from public.v_historie_zarizeni where zaznam_id = v_otevrena;

  if v_pocet <> 0 then
    raise exception 'Otevřená zakázka je v historii %krát.', v_pocet;
  end if;
  v_kontrol := v_kontrol + 1;

  -- ---------------------------------------------------------------------------
  -- 3. Zrušená zakázka v historii taky není
  -- ---------------------------------------------------------------------------
  select count(*) into v_pocet
  from public.v_historie_zarizeni where zaznam_id = v_zrusena;

  if v_pocet <> 0 then
    raise exception 'Zrušená zakázka je v historii %krát. Historie by tvrdila, že se něco stalo.',
      v_pocet;
  end if;
  v_kontrol := v_kontrol + 1;

  -- ---------------------------------------------------------------------------
  -- 4. Zápis z deníku je v historii i se vším, co má jen deník
  -- ---------------------------------------------------------------------------
  select * into v_radek
  from public.v_historie_zarizeni
  where zaznam_id = v_zapis;

  if not found then
    raise exception 'Zápis z deníku v historii chybí. Osa má polovinu.';
  end if;

  if v_radek.puvod <> 'denik' then
    raise exception 'Zápis má původ „%", čekal se denik.', v_radek.puvod;
  end if;

  if v_radek.nazev <> 'Výměna žárovky' then
    raise exception 'Zásah se v ose jmenuje „%", čekal se název druhu.', v_radek.nazev;
  end if;

  if v_radek.doba_trvani_min <> 20 then
    raise exception 'Doba trvání v ose je %, čekalo se 20.', v_radek.doba_trvani_min;
  end if;

  if v_radek.zapsal_id <> v_udrzbar then
    raise exception 'Kdo zápis pořídil, se do osy nepropsalo.';
  end if;

  if v_radek.fotek <> 1 then
    raise exception 'U zápisu je napočítáno % fotek, čekala se 1.', v_radek.fotek;
  end if;

  -- Zásah z deníku nemá checklist. Nula by tvrdila, že měl a byl prázdný.
  if v_radek.ukonu_celkem is not null then
    raise exception 'Zásah z deníku má počet kroků %, čekalo se null.', v_radek.ukonu_celkem;
  end if;
  v_kontrol := v_kontrol + 1;

  -- ---------------------------------------------------------------------------
  -- 5. Osa stroje má právě dvě události a řadí se od nejnovější
  -- ---------------------------------------------------------------------------
  select count(*) into v_pocet
  from public.v_historie_zarizeni where zarizeni_id = v_stroj;

  if v_pocet <> 2 then
    raise exception 'Osa stroje má % událostí, čekaly se 2 (zakázka + deník).', v_pocet;
  end if;

  select * into v_radek
  from public.v_historie_zarizeni
  where zarizeni_id = v_stroj
  order by kdy desc
  limit 1;

  if v_radek.zaznam_id <> v_zapis then
    raise exception 'Na začátku osy není nejnovější událost.';
  end if;
  v_kontrol := v_kontrol + 1;

  -- ---------------------------------------------------------------------------
  -- 6. Do osy se nepřimíchá stroj vedle
  -- ---------------------------------------------------------------------------
  select count(*) into v_pocet
  from public.v_historie_zarizeni
  where zarizeni_id = v_stroj and popis = 'Zásah na jiném stroji';

  if v_pocet <> 0 then
    raise exception 'V historii stroje je událost jiného stroje.';
  end if;
  v_kontrol := v_kontrol + 1;

  -- ---------------------------------------------------------------------------
  -- 7. Přes historii nevidí specialista CNC do strojní oblasti
  --
  --    Tohle je důsledek security_invoker. Kdyby chyběl, pohled by vracel
  --    všechno bez ohledu na to, kdo se ptá - a nebylo by to na číslech vidět.
  -- ---------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_cnc, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  select count(*) into v_pocet
  from public.v_historie_zarizeni where zarizeni_id = v_stroj;

  if v_pocet <> 0 then
    raise exception 'Specialista CNC vidí v historii % událostí strojní oblasti.', v_pocet;
  end if;
  v_kontrol := v_kontrol + 1;

  execute 'reset role';

  raise notice 'Test historie zařízení prošel: všech % kontrol v pořádku.', v_kontrol;
end;
$$;

rollback;
