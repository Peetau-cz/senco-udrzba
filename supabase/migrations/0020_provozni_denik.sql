-- =============================================================================
-- M5 - Provozní deník
--
-- Odpovídá docs/NAVRH.md kap. 2.5 a zadání ř. 134-144: evidence NEPLÁNOVANÝCH
-- zásahů (výměna žárovky, dotažení krytu, hadice, snímač, seřízení, čištění).
--
-- Rozhodnutí R4, na kterém stojí celý modul: deník NEOVLIVŇUJE plán preventivní
-- údržby ani plnění matice (zadání ř. 144). Proto tu není jediný odkaz do
-- plan_udrzby ani jediný trigger, který by se ho dotkl. Sjednocení obou světů
-- přijde až pohledem v_historie_zarizeni (migrace 0022) - tedy až při čtení,
-- nikdy při zápisu. Hlídá to supabase/tests/denik.sql.
--
-- Odchylka od návrhu (rozhodnutí uživatele z 26. 8. 2026): návrh měl na deníku
-- sloupec `typ_zasahu`, tedy výčet. Místo něj je tu ČÍSELNÍK druh_zasahu.
-- Zadání ř. 137 uvádí šest druhů slovem „například", takže výčet z podstaty
-- není úplný - a rozšířit ho má jít záznamem, ne migrací a nasazením. Stejná
-- úvaha jako u oblastí (zásada R2 v návrhu).
--
-- Čistý PostgreSQL. Fotky leží v Supabase Storage a to je jediná část závislá
-- na Supabase - proto přijde samostatnou migrací 0021 (PORTABILITA.md, pravidlo 2).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Číselník druhů zásahu
--
-- Vyřazený druh se nemaže, ale zhasne (aktivni = false): zápisy, které ho už
-- používají, ho drží cizím klíčem `on delete restrict` a historie nemá zmizet
-- jen proto, že se dnes takový zásah přestal dělat.
-- -----------------------------------------------------------------------------

create table public.druh_zasahu (
  id           uuid primary key default gen_random_uuid(),
  kod          text not null unique,
  nazev        text not null,
  poradi       integer not null default 0,
  aktivni      boolean not null default true,
  vytvoreno_at timestamptz not null default now(),
  zmeneno_at   timestamptz not null default now(),
  constraint druh_zasahu_kod_neni_prazdny   check (length(btrim(kod)) > 0),
  constraint druh_zasahu_nazev_neni_prazdny check (length(btrim(nazev)) > 0)
);

comment on table public.druh_zasahu is
  'Číselník druhů neplánovaného zásahu. Zadání ř. 138-143 dává šest příkladů, další doplní vedoucí údržby.';

-- Šest druhů ze zadání jako výchozí obsah. Patří do migrace, ne do seed.sql:
-- prázdný číselník by znamenal, že se hned po nasazení nedá zapsat nic.
insert into public.druh_zasahu (kod, nazev, poradi) values
  ('vymena_zarovky',  'Výměna žárovky', 1),
  ('dotazeni_krytu',  'Dotažení krytu', 2),
  ('vymena_hadice',   'Výměna hadice',  3),
  ('oprava_snimace',  'Oprava snímače', 4),
  ('serizeni',        'Seřízení',       5),
  ('cisteni',         'Čištění',        6);

-- -----------------------------------------------------------------------------
-- Zápis v deníku
--
-- Sloupec oblast_id je stejná vědomá denormalizace jako u zarizeni_sablona
-- (migrace 0006): existuje kvůli složenému cizímu klíči, který ohlídá, že
-- zápis nesedí u stroje z jiné oblasti, než na kterou se odvolává. RLS se pak
-- ptá přímo sloupce a nemusí kvůli každému řádku sahat na zařízení.
--
-- provedl_id vs. zapsal_id (rozhodnutí uživatele z 26. 8. 2026): v hale je
-- jeden tablet a zápis vzniká po směně, často za kolegu. Obě pole se proto
-- předvyplní přihlášeným, ale „provedl" jde přepsat. Kdo zápis pořídil, se
-- nepřepisuje nikdy - drží to sloupcová práva dole.
--
-- provedeno_at je timestamptz s výchozím now() a zapsat jde ZPĚTNĚ. Dopředu ne:
-- hlídá to trigger níž, protože CHECK s now() PostgreSQL nepřijme.
-- -----------------------------------------------------------------------------

create table public.provozni_denik (
  id              uuid primary key default gen_random_uuid(),
  zarizeni_id     uuid not null,
  oblast_id       uuid not null,
  druh_zasahu_id  uuid not null references public.druh_zasahu (id) on delete restrict,
  popis           text not null,
  provedeno_at    timestamptz not null default now(),
  provedl_id      uuid default public.aktualni_uzivatel()
                    references public.profil (id) on delete set null,
  doba_trvani_min integer,
  zapsal_id       uuid default public.aktualni_uzivatel()
                    references public.profil (id) on delete set null,
  vytvoreno_at    timestamptz not null default now(),
  zmeneno_at      timestamptz not null default now(),
  -- Stroj i oblast jedním klíčem, aby se nemohly rozejít. `on delete restrict`:
  -- vyřazený stroj z evidence nemizí (migrace 0003), takže deník o něj nepřijde.
  constraint provozni_denik_zarizeni_fk
    foreign key (zarizeni_id, oblast_id) references public.zarizeni (id, oblast_id)
    on update cascade on delete restrict,
  -- Druh sám o sobě neřekne, co se dělo. „Výměna hadice" bez popisu je za rok
  -- k ničemu, a je to jediný řádek textu.
  constraint provozni_denik_popis_neni_prazdny check (length(btrim(popis)) > 0),
  -- Doba trvání je VOLITELNÁ (rozhodnutí uživatele z 26. 8. 2026): zápis na
  -- tabletu má jít odbýt třemi klepnutími. Když ji ale někdo vyplní, musí dávat
  -- smysl - horní mez je 24 hodin, delší zásah je oprava, ne řádek v deníku.
  constraint provozni_denik_doba_je_rozumna
    check (doba_trvani_min is null or doba_trvani_min between 1 and 1440)
);

create index provozni_denik_zarizeni_idx on public.provozni_denik (zarizeni_id, provedeno_at desc);
create index provozni_denik_oblast_idx   on public.provozni_denik (oblast_id, provedeno_at desc);
create index provozni_denik_druh_idx     on public.provozni_denik (druh_zasahu_id);
create index provozni_denik_provedl_idx  on public.provozni_denik (provedl_id);

comment on table public.provozni_denik is
  'Neplánované zásahy (zadání ř. 134-144). Do plánu ani do plnění matice nezasahuje - rozhodnutí R4.';

comment on column public.provozni_denik.provedl_id is
  'Kdo zásah skutečně udělal. Může být někdo jiný než zapsal_id - v hale zapisuje jeden tablet za partu.';

comment on column public.provozni_denik.zapsal_id is
  'Kdo zápis pořídil. Rozhoduje o právu opravit (okno 24 h) a nejde přepsat.';

-- -----------------------------------------------------------------------------
-- Fotky k zápisu
-- -----------------------------------------------------------------------------

create table public.denik_foto (
  id           uuid primary key default gen_random_uuid(),
  zaznam_id    uuid not null references public.provozni_denik (id) on delete cascade,
  storage_path text not null unique,
  popis        text,
  nahral_id    uuid references public.profil (id) on delete set null,
  vytvoreno_at timestamptz not null default now(),
  constraint denik_foto_cesta_neni_prazdna check (length(btrim(storage_path)) > 0)
);

create index denik_foto_zaznam_idx on public.denik_foto (zaznam_id);

comment on table public.denik_foto is
  'Fotodokumentace zásahu (zadání ř. 151). Soubory leží v Supabase Storage, viz migrace 0021.';

-- -----------------------------------------------------------------------------
-- Zásah se nezapisuje dopředu
--
-- Zpětný zápis je běžný provoz - píše se po směně, někdy až druhý den. Datum
-- v budoucnosti je ale vždycky překlep (nejčastěji v roce) a v historii stroje
-- by seděl na místě, kam se nikdo nedívá. Den tolerance kryje posun hodin
-- a časových pásem, rok už ne.
-- -----------------------------------------------------------------------------

create or replace function public.zkontroluj_cas_zasahu()
returns trigger
language plpgsql
as $$
begin
  if new.provedeno_at > now() + interval '1 day' then
    raise exception 'Zásah se zapisuje zpětně, ne dopředu. Datum % je v budoucnosti.',
      to_char(new.provedeno_at, 'DD.MM.YYYY HH24:MI')
      using errcode = '23514';
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Oprava zápisu (rozhodnutí uživatele z 26. 8. 2026)
--
-- Mazat nelze nikdy (zadání ř. 155, zásada R5) - drží to odebrané právo DELETE
-- i tenhle trigger. Opravit smí:
--   * ten, kdo zápis pořídil, do 24 hodin od zapsání,
--   * vedoucí údržby a administrátor kdykoli.
--
-- Okno se počítá od vytvoreno_at, ne od provedeno_at: rozhoduje, kdy zápis
-- vznikl, ne kdy se u stroje pracovalo. Zpětný zápis by jinak byl uzamčený
-- už v okamžiku vzniku.
--
-- Proč vůbec okno: bez něj je „historii nelze mazat" polovičaté, protože zápis
-- jde tiše přepsat na cokoli. S ním se překlep opraví, dokud si ho autor
-- pamatuje, a starší zásahy jsou na jméno vedoucího. Každá změna je i tak
-- v audit_log včetně původního stavu.
-- -----------------------------------------------------------------------------

create or replace function public.zamkni_zapis_deniku()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_okno constant interval := interval '24 hours';
begin
  if tg_op = 'DELETE' then
    raise exception 'Zápis v provozním deníku se nemaže - historie zařízení musí zůstat úplná.'
      using errcode = '23514';
  end if;

  if public.ma_roli('administrator') or public.ma_roli('vedouci_udrzby') then
    return new;
  end if;

  if old.zapsal_id is distinct from public.aktualni_uzivatel() then
    raise exception 'Cizí zápis v deníku opravit nelze. Požádejte vedoucího údržby.'
      using errcode = '42501';
  end if;

  if now() - old.vytvoreno_at > v_okno then
    raise exception 'Zápis je starší než 24 hodin, opravit ho už může jen vedoucí údržby.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.zamkni_zapis_deniku is
  'Okno na opravu zápisu: autor do 24 h, vedoucí údržby a administrátor kdykoli. Mazat nelze nikdy.';

-- Fotky se řídí stejným oknem jako zápis, ke kterému patří. Mazat je na rozdíl
-- od zápisu jde - omylem nahranou fotku musí jít během opravy odebrat. Soubor
-- v úložišti maže aplikace PŘED řádkem, ne trigger (migrace 0016).
create or replace function public.zamkni_fotky_deniku()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_zaznam  uuid;
  v_zapsal  uuid;
  v_vzniklo timestamptz;
begin
  if tg_op = 'DELETE' then
    v_zaznam := old.zaznam_id;
  else
    v_zaznam := new.zaznam_id;
  end if;

  select zapsal_id, vytvoreno_at into v_zapsal, v_vzniklo
  from public.provozni_denik
  where id = v_zaznam;

  -- Zápis neexistuje: smazat ho nejde, takže sem vede leda úklid schématu
  -- a tam bránit nemá smysl. Stejná úvaha jako u zakázek v migraci 0011.
  if v_vzniklo is not null
     and not (public.ma_roli('administrator') or public.ma_roli('vedouci_udrzby'))
  then
    if v_zapsal is distinct from public.aktualni_uzivatel() then
      raise exception 'K cizímu zápisu v deníku fotky přidávat ani mazat nelze.'
        using errcode = '42501';
    end if;

    if now() - v_vzniklo > interval '24 hours' then
      raise exception 'Zápis je starší než 24 hodin, fotodokumentaci už mění jen vedoucí údržby.'
        using errcode = '42501';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Triggery
-- -----------------------------------------------------------------------------

create trigger druh_zasahu_zmeneno_at
  before update on public.druh_zasahu
  for each row execute function public.nastav_zmeneno_at();

create trigger provozni_denik_cas
  before insert or update on public.provozni_denik
  for each row execute function public.zkontroluj_cas_zasahu();

create trigger provozni_denik_zamek
  before update or delete on public.provozni_denik
  for each row execute function public.zamkni_zapis_deniku();

create trigger provozni_denik_zmeneno_at
  before update on public.provozni_denik
  for each row execute function public.nastav_zmeneno_at();

create trigger denik_foto_zamek
  before insert or update or delete on public.denik_foto
  for each row execute function public.zamkni_fotky_deniku();

create trigger druh_zasahu_audit
  after insert or update or delete on public.druh_zasahu
  for each row execute function public.audit_zmeny();

create trigger provozni_denik_audit
  after insert or update or delete on public.provozni_denik
  for each row execute function public.audit_zmeny();

create trigger denik_foto_audit
  after insert or update or delete on public.denik_foto
  for each row execute function public.audit_zmeny();

-- -----------------------------------------------------------------------------
-- Row Level Security
--
-- Kdo smí do deníku zapisovat, říká matice oprávnění (NAVRH.md kap. 3.1):
-- všichni kromě managementu, ve svých oblastech. To je přesně podmínka funkce
-- provadi_udrzbu_v_oblasti z migrace 0011 - deník a provedení údržby mají
-- v matici stejný řádek práv, takže druhá funkce se stejným tělem by byla jen
-- druhá pravda, která se časem rozejde.
--
-- Číst smí každý, kdo na oblast vidí, včetně managementu: historie zařízení
-- (zadání ř. 147) stojí zrovna tak na deníku jako na zakázkách.
-- -----------------------------------------------------------------------------

alter table public.druh_zasahu    enable row level security;
alter table public.provozni_denik enable row level security;
alter table public.denik_foto     enable row level security;

-- druh_zasahu -----------------------------------------------------------------
-- Číselník čte každý (jinak by nešel vyplnit formulář), spravují ho stejné role
-- jako umístění a oblasti.
create policy druh_zasahu_select on public.druh_zasahu
  for select to authenticated
  using (true);

create policy druh_zasahu_zapis on public.druh_zasahu
  for all to authenticated
  using (public.spravuje_ciselniky())
  with check (public.spravuje_ciselniky());

-- provozni_denik --------------------------------------------------------------
create policy provozni_denik_select on public.provozni_denik
  for select to authenticated
  using (public.ma_pristup_k_oblasti(oblast_id));

-- Zapsat lze jen sám za sebe: „kdo zápis pořídil" je autorita pro okno na
-- opravu, takže se nesmí dát podstrčit. Koho uvede jako toho, kdo zásah
-- provedl, je věc formuláře - databáze do toho nemluví, protože zásah mohl
-- udělat i někdo, kdo do systému vůbec nechodí.
create policy provozni_denik_insert on public.provozni_denik
  for insert to authenticated
  with check (
    public.provadi_udrzbu_v_oblasti(oblast_id)
    and zapsal_id = public.aktualni_uzivatel()
  );

-- Kdo a dokdy smí opravovat, rozhoduje trigger - kvůli srozumitelné hlášce.
-- Politika drží hranici oblasti a to, že zápis nesmí přeskočit do cizí.
create policy provozni_denik_update on public.provozni_denik
  for update to authenticated
  using (public.provadi_udrzbu_v_oblasti(oblast_id))
  with check (public.provadi_udrzbu_v_oblasti(oblast_id));

-- DELETE politika schválně žádná. Bez ní neprojde mazání ani administrátorovi.

-- denik_foto ------------------------------------------------------------------
create policy denik_foto_select on public.denik_foto
  for select to authenticated
  using (
    exists (
      select 1 from public.provozni_denik d
      where d.id = denik_foto.zaznam_id
        and public.ma_pristup_k_oblasti(d.oblast_id)
    )
  );

create policy denik_foto_zapis on public.denik_foto
  for all to authenticated
  using (
    exists (
      select 1 from public.provozni_denik d
      where d.id = denik_foto.zaznam_id
        and public.provadi_udrzbu_v_oblasti(d.oblast_id)
    )
  )
  with check (
    exists (
      select 1 from public.provozni_denik d
      where d.id = denik_foto.zaznam_id
        and public.provadi_udrzbu_v_oblasti(d.oblast_id)
    )
  );

-- -----------------------------------------------------------------------------
-- Práva
--
-- UPDATE je vypsaný po sloupcích ze stejného důvodu jako u zakázek: RLS
-- rozhoduje o řádcích, ne o sloupcích. Bez toho by šlo při opravě popisu
-- přepsat i zapsal_id, a okno na opravu by tím ztratilo smysl - stačilo by
-- se do cizího zápisu dopsat jako autor.
--
-- Opravit jde i zařízení a datum: nejčastější chyba je vybraný špatný stroj,
-- a zápis, který se dá opravit jen v popisu, by kvůli ní zůstal navěky u cizí
-- mašiny. Oblast je v seznamu proto, že se stroj a oblast mění jedním klíčem.
-- -----------------------------------------------------------------------------

revoke all on public.druh_zasahu, public.provozni_denik, public.denik_foto from anon;

grant select, insert, update, delete on public.druh_zasahu to authenticated;

-- INSERT je po sloupcích ze stejného důvodu jako UPDATE, a hlavně kvůli
-- vytvoreno_at: od něj se počítá okno na opravu. Kdyby ho směl poslat klient,
-- stačilo by si při zápisu nastavit datum v budoucnosti a zápis by zůstal
-- opravitelný napořád. Takhle ho vyplní výhradně výchozí hodnota.
grant select on public.provozni_denik to authenticated;
grant insert (zarizeni_id, oblast_id, druh_zasahu_id, popis, provedeno_at,
              provedl_id, doba_trvani_min, zapsal_id)
  on public.provozni_denik to authenticated;
grant update (zarizeni_id, oblast_id, druh_zasahu_id, popis, provedeno_at,
              provedl_id, doba_trvani_min)
  on public.provozni_denik to authenticated;

-- Klíčové pro úplnost historie (zásada R5). RLS by to nezajistila.
revoke delete on public.provozni_denik from authenticated, anon;

grant select, insert, delete on public.denik_foto to authenticated;
grant update (popis) on public.denik_foto to authenticated;
