-- =============================================================================
-- Přiřazení rolí a oblastí testovacím uživatelům — náhrada za scripts/seed-users.mjs
-- pro případ, kdy ještě není nainstalovaný Node.js.
--
-- POSTUP:
--   1. Nahrajte supabase/migrations/0001_identita_a_opravneni.sql
--   2. Nahrajte supabase/seed.sql  (oblasti a role)
--   3. V Supabase → Authentication → Users → Add user založte ručně těchto
--      osm účtů. Zaškrtněte "Auto Confirm User", heslo zvolte stejné pro všechny:
--
--        admin@senco.test        vedouci@senco.test
--        cnc@senco.test          elektro@senco.test
--        udrzbar@senco.test      lakovna@senco.test
--        sklad@senco.test        management@senco.test
--
--   4. Spusťte tento skript v SQL editoru.
--
-- Skript je idempotentní. Účty, které nenajde, jen ohlásí a přeskočí.
-- NIKDY nespouštět proti ostrému prostředí.
-- =============================================================================

do $$
declare
  r          record;
  v_id       uuid;
  v_role_id  uuid;
  v_oblast   uuid;
  v_chybi    integer := 0;
  v_hotovo   integer := 0;
begin
  -- --- Profily a role -------------------------------------------------------
  for r in
    select * from (values
      ('admin@senco.test',      'Adam',   'Správce',    '1001', 'administrator'),
      ('vedouci@senco.test',    'Petr',   'Vedoucí',    '1002', 'vedouci_udrzby'),
      ('cnc@senco.test',        'Jan',    'Novák',      '1003', 'specialista_cnc'),
      ('elektro@senco.test',    'Martin', 'Dvořák',     '1004', 'specialista_elektro'),
      ('udrzbar@senco.test',    'Josef',  'Svoboda',    '1005', 'udrzbar'),
      ('lakovna@senco.test',    'Eva',    'Králová',    '1006', 'vedouci_lakovny'),
      ('sklad@senco.test',      'Tomáš',  'Horák',      '1007', 'pracovnik_skladu'),
      ('management@senco.test', 'Irena',  'Ředitelová', '1008', 'management')
    ) as t(email, jmeno, prijmeni, osobni_cislo, role_kod)
  loop
    select id into v_id from auth.users where email = r.email;

    if v_id is null then
      raise notice 'CHYBÍ účet %  — založte jej v Authentication → Users', r.email;
      v_chybi := v_chybi + 1;
      continue;
    end if;

    -- Profil normálně zakládá trigger nad auth.users. Pokud byl účet vytvořen
    -- dřív než migrace, trigger neproběhl - proto doplníme ručně.
    insert into public.profil (id, email, jmeno, prijmeni, osobni_cislo)
    values (v_id, r.email, r.jmeno, r.prijmeni, r.osobni_cislo)
    on conflict (id) do update
      set jmeno = excluded.jmeno,
          prijmeni = excluded.prijmeni,
          osobni_cislo = excluded.osobni_cislo,
          email = excluded.email;

    select id into v_role_id from public.role where kod = r.role_kod;
    if v_role_id is null then
      raise exception 'Chybí role %. Nahrajte nejdřív supabase/seed.sql.', r.role_kod;
    end if;

    insert into public.uzivatel_role (uzivatel_id, role_id)
    values (v_id, v_role_id)
    on conflict do nothing;

    v_hotovo := v_hotovo + 1;
  end loop;

  -- --- Oblasti --------------------------------------------------------------
  -- Administrátor, vedoucí údržby a management mají přístup ke všem oblastem
  -- z titulu role (zadání ř. 51), proto tu nejsou.
  for r in
    select * from (values
      ('cnc@senco.test',     'cnc',     'garant'),
      ('elektro@senco.test', 'elektro', 'garant'),
      ('udrzbar@senco.test', 'strojni', 'garant'),
      -- Lakovna má garanta i spolupracující osobu (zadání ř. 32-36).
      ('udrzbar@senco.test', 'lakovna', 'spolupracujici'),
      ('lakovna@senco.test', 'lakovna', 'garant'),
      ('sklad@senco.test',   'vzv',     'garant')
    ) as t(email, oblast_kod, vztah)
  loop
    select id into v_id from auth.users where email = r.email;
    select id into v_oblast from public.oblast where kod = r.oblast_kod;

    if v_id is null or v_oblast is null then
      continue;
    end if;

    insert into public.uzivatel_oblast (uzivatel_id, oblast_id, vztah)
    values (v_id, v_oblast, r.vztah::public.vztah_k_oblasti)
    on conflict (uzivatel_id, oblast_id) do update set vztah = excluded.vztah;
  end loop;

  raise notice 'Hotovo: % účtů přiřazeno, % chybí.', v_hotovo, v_chybi;

  if v_chybi > 0 then
    raise notice 'Chybějící účty založte v Authentication → Users a skript spusťte znovu.';
  end if;
end;
$$;

-- Kontrolní přehled - co má kdo přiřazeno.
select
  p.email,
  string_agg(distinct r.kod, ', ' order by r.kod)                          as role,
  string_agg(distinct o.kod || ' (' || uo.vztah || ')', ', ')              as oblasti
from public.profil p
left join public.uzivatel_role ur   on ur.uzivatel_id = p.id
left join public.role r             on r.id = ur.role_id
left join public.uzivatel_oblast uo on uo.uzivatel_id = p.id
left join public.oblast o           on o.id = uo.oblast_id
group by p.email
order by p.email;
