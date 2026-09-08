-- =============================================================================
-- Ověření osob bez účtu a karet (migrace 0024 a 0025).
--
-- Test se dívá na pět věcí, které na obrazovce poznat nejdou:
--
--   * osoba jde založit BEZ mailu a BEZ účtu - to je celý smysl migrace 0024,
--   * šev aktualni_uzivatel() překládá ÚČET na OSOBU, tedy vrací něco jiného,
--     než co přišlo v tokenu (do 0024 to byla tatáž hodnota),
--   * číslo karty je osobní údaj a nevidí ho každý přihlášený,
--   * karta identifikuje jen v oblasti, na kterou volající vidí - kiosek
--     strojní údržby nezjistí, kdo pracuje v lakovně,
--   * kartu nelze smazat ani obejít její zneaktivnění.
--
-- Spuštění: v SQL editoru Supabase nebo přes psql, pod rolí postgres.
-- Předpoklad: proběhly migrace 0001-0025, seed.sql a přiřazení uživatelů
-- (npm run seed:users, nebo supabase/prirazeni_uzivatelu.sql).
--
-- Skript nic nemění - celý běží v transakci, která se na konci vrací.
-- =============================================================================

begin;

do $$
declare
  v_admin      uuid;
  v_vedouci    uuid;
  v_udrzbar    uuid;
  v_lakovnik   uuid;

  v_ob_strojni uuid;
  v_ob_lakovna uuid;

  v_osoba      uuid;   -- nový člověk z dílny, bez mailu a bez účtu
  v_osoba_lak  uuid;   -- totéž, ale v lakovně
  v_ucet       uuid;   -- vymyšlené id účtu pro ověření švu
  v_vraceno    uuid;

  v_karta      uuid;
  v_pocet      integer;
  v_proslo     boolean;
  v_kontrol    integer := 0;
begin
  select id into v_admin    from public.profil where email = 'admin@senco.test';
  select id into v_vedouci  from public.profil where email = 'vedouci@senco.test';
  select id into v_udrzbar  from public.profil where email = 'udrzbar@senco.test';
  select id into v_lakovnik from public.profil where email = 'lakovna@senco.test';

  select id into v_ob_strojni from public.oblast where kod = 'strojni';
  select id into v_ob_lakovna from public.oblast where kod = 'lakovna';

  if v_admin is null or v_udrzbar is null or v_lakovnik is null then
    raise exception 'Chybí testovací účty. Spusťte npm run seed:users.';
  end if;

  -- ---------------------------------------------------------------------------
  -- 1. Administrátor založí osobu bez mailu a bez účtu
  -- ---------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  insert into public.profil (jmeno, prijmeni, osobni_cislo)
  values ('Karel', 'Zámečník', 'T-9001')
  returning id into v_osoba;

  insert into public.profil (jmeno, prijmeni, osobni_cislo)
  values ('Alena', 'Lakýrnice', 'T-9002')
  returning id into v_osoba_lak;

  if v_osoba is null then
    raise exception 'Osobu bez mailu se nepodařilo založit. Migrace 0024 neproběhla?';
  end if;
  v_kontrol := v_kontrol + 1;

  -- Bez účtu, bez mailu - a přesto plnohodnotný cíl pro dokoncil_id.
  select count(*) into v_pocet
  from public.profil
  where id = v_osoba and ucet_id is null and email is null;

  if v_pocet <> 1 then
    raise exception 'Osoba bez účtu má vyplněný ucet_id nebo email.';
  end if;
  v_kontrol := v_kontrol + 1;

  insert into public.uzivatel_oblast (uzivatel_id, oblast_id, vztah)
  values (v_osoba, v_ob_strojni, 'spolupracujici'),
         (v_osoba_lak, v_ob_lakovna, 'spolupracujici');

  execute 'reset role';

  -- ---------------------------------------------------------------------------
  -- 2. Šev: aktualni_uzivatel() vrací OSOBU, ne účet
  --
  -- Osobě podstrčíme vymyšlené id účtu a přihlásíme se pod ním. Kdyby funkce
  -- vracela auth.uid(), dostaneme id účtu - a to je přesně ta chyba, kterou
  -- migrace 0025 odstraňuje.
  -- ---------------------------------------------------------------------------
  v_ucet := gen_random_uuid();
  update public.profil set ucet_id = v_ucet where id = v_osoba;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ucet, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  select public.aktualni_uzivatel() into v_vraceno;

  if v_vraceno is distinct from v_osoba then
    raise exception 'Šev vrátil % místo osoby %. Překlad účtu na osobu nefunguje.',
      v_vraceno, v_osoba;
  end if;
  v_kontrol := v_kontrol + 1;

  if v_vraceno = v_ucet then
    raise exception 'Šev vrátil id účtu. Migrace 0025 nebyla nasazena.';
  end if;
  v_kontrol := v_kontrol + 1;

  execute 'reset role';
  update public.profil set ucet_id = null where id = v_osoba;

  -- ---------------------------------------------------------------------------
  -- 3. Karty zakládá správa, ne kdokoli
  -- ---------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  insert into public.karta (profil_id, cislo) values (v_osoba, 'KARTA-0001')
  returning id into v_karta;

  insert into public.karta (profil_id, cislo) values (v_osoba_lak, 'KARTA-0002');
  v_kontrol := v_kontrol + 1;

  execute 'reset role';

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_udrzbar, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  v_proslo := false;
  begin
    insert into public.karta (profil_id, cislo) values (v_udrzbar, 'KARTA-CIZI');
    v_proslo := true;
  exception when insufficient_privilege then
    v_proslo := false;
  end;

  if v_proslo then
    raise exception 'Údržbář si sám sobě založil kartu. Karty patří správě.';
  end if;
  v_kontrol := v_kontrol + 1;

  -- ---------------------------------------------------------------------------
  -- 4. Číslo karty je osobní údaj - běžný uživatel ho nevidí
  -- ---------------------------------------------------------------------------
  select count(*) into v_pocet from public.karta;

  if v_pocet <> 0 then
    raise exception 'Údržbář vidí % karet. Číslo karty má vidět jen správa.', v_pocet;
  end if;
  v_kontrol := v_kontrol + 1;

  -- ...ale identifikaci kartou potřebuje, a tu dostane funkcí.
  select count(*) into v_pocet from public.osoba_podle_karty('KARTA-0001');

  if v_pocet <> 1 then
    raise exception 'Karta z vlastní oblasti neidentifikovala osobu (vráceno % řádků).', v_pocet;
  end if;
  v_kontrol := v_kontrol + 1;

  -- ---------------------------------------------------------------------------
  -- 5. Karta identifikuje jen v oblasti, na kterou volající vidí
  --
  -- Údržbář má strojní a lakovnu (seed), proto se ptáme za vedoucího lakovny -
  -- ten na strojní údržbu nevidí.
  -- ---------------------------------------------------------------------------
  execute 'reset role';

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_lakovnik, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  select count(*) into v_pocet from public.osoba_podle_karty('KARTA-0001');

  if v_pocet <> 0 then
    raise exception 'Vedoucí lakovny identifikoval kartu ze strojní údržby. Hranice oblastí neplatí.';
  end if;
  v_kontrol := v_kontrol + 1;

  select count(*) into v_pocet from public.osoba_podle_karty('KARTA-0002');

  if v_pocet <> 1 then
    raise exception 'Vedoucí lakovny neidentifikoval kartu z vlastní oblasti.';
  end if;
  v_kontrol := v_kontrol + 1;

  -- Osobní číslo je záloha ke kartě a platí pro něj totéž omezení.
  select count(*) into v_pocet from public.osoba_podle_osobniho_cisla('T-9001');

  if v_pocet <> 0 then
    raise exception 'Osobní číslo obešlo hranici oblastí, na kterou karta nestačila.';
  end if;
  v_kontrol := v_kontrol + 1;

  execute 'reset role';

  -- ---------------------------------------------------------------------------
  -- 6. Neaktivní karta neidentifikuje a uvolní číslo
  -- ---------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  update public.karta set aktivni = false where id = v_karta;

  execute 'reset role';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_udrzbar, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  select count(*) into v_pocet from public.osoba_podle_karty('KARTA-0001');

  if v_pocet <> 0 then
    raise exception 'Zneaktivněná karta pořád identifikuje.';
  end if;
  v_kontrol := v_kontrol + 1;

  execute 'reset role';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  -- Vyřazené číslo smí firma vydat znovu - unikátnost platí jen mezi aktivními.
  insert into public.karta (profil_id, cislo) values (v_osoba, 'KARTA-0001');
  v_kontrol := v_kontrol + 1;

  -- Dvě AKTIVNÍ karty se stejným číslem ale ne.
  v_proslo := false;
  begin
    insert into public.karta (profil_id, cislo) values (v_osoba_lak, 'KARTA-0001');
    v_proslo := true;
  exception when unique_violation then
    v_proslo := false;
  end;

  if v_proslo then
    raise exception 'Dvě aktivní karty mají stejné číslo. Identifikace by byla nejednoznačná.';
  end if;
  v_kontrol := v_kontrol + 1;

  -- ---------------------------------------------------------------------------
  -- 7. Kartu nelze smazat - ztracená karta má zůstat dohledatelná (zásada R5)
  -- ---------------------------------------------------------------------------
  v_proslo := false;
  begin
    delete from public.karta where id = v_karta;
    v_proslo := true;
  exception when insufficient_privilege then
    v_proslo := false;
  end;

  if v_proslo then
    raise exception 'Kartu šlo smazat. Vyřazená karta se zneaktivňuje, nemaže.';
  end if;
  v_kontrol := v_kontrol + 1;

  -- ---------------------------------------------------------------------------
  -- 8. Změny karet se zapisují do auditu
  -- ---------------------------------------------------------------------------
  execute 'reset role';

  select count(*) into v_pocet
  from public.audit_log
  where tabulka = 'karta' and zaznam_id = v_karta::text;

  if v_pocet < 2 then
    raise exception 'Audit karty má % záznamů, čekaly se aspoň dva (vznik a zneaktivnění).', v_pocet;
  end if;
  v_kontrol := v_kontrol + 1;

  raise notice 'Test osob a karet prošel: všech % kontrol v pořádku.', v_kontrol;
end;
$$;

rollback;
