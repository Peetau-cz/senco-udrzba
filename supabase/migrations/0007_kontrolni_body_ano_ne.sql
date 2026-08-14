-- =============================================================================
-- M2 - kontrolní body s druhem zápisu
--
-- Do teď byl kontrolní bod holý text: „1000 | 3000 | 6000 ot.". To stačí tam,
-- kde bod říká, PŘI ČEM se měří, ale ne tam, kde je to prostá otázka
-- („Kryt dotažen?"). Technik by u ní v checklistu neměl co vyplnit.
--
-- Bod proto dostává druh:
--   hodnota  - technik na tom místě zapíše naměřenou hodnotu (v jednotce úkonu)
--   ano_ne   - technik jen odškrtne, že to tak je
--
-- Tvar v JSONB:
--   [{"nazev": "1000 ot.", "typ": "hodnota"},
--    {"nazev": "Kryt dotažen", "typ": "ano_ne"}]
--
-- Kontrolu tvaru dělá CHECK nad IMMUTABLE funkcí, stejně jako u schématu
-- vlastních parametrů v migraci 0003. Autoritou je databáze, ne formulář.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Kontrola tvaru
-- -----------------------------------------------------------------------------

create or replace function public.jsou_platne_kontrolni_body(p_body jsonb)
returns boolean
language sql
immutable
as $$
  select p_body is null or (
    jsonb_typeof(p_body) = 'array'
    and not exists (
      select 1
      from jsonb_array_elements(p_body) as prvek(bod)
      where jsonb_typeof(prvek.bod) <> 'object'
         or prvek.bod ->> 'nazev' is null
         or length(btrim(prvek.bod ->> 'nazev')) = 0
         or prvek.bod ->> 'typ' is null
         or prvek.bod ->> 'typ' not in ('hodnota', 'ano_ne')
    )
  );
$$;

comment on function public.jsou_platne_kontrolni_body is
  'Ověří tvar kontrolních bodů úkonu. Zrcadlí src/lib/sablony/kontrolni-body.ts.';

-- -----------------------------------------------------------------------------
-- Převod dosavadních dat
--
-- Body zapsané jako holé texty se stávají body druhu `hodnota` - tak byly
-- dosud myšlené (prahy, při kterých se měří). Prázdné pole zůstává prázdné.
--
-- Zámek aktivované verze z migrace 0006 by tenhle UPDATE zablokoval, a právem:
-- běžný uživatel obsah archivované matice měnit nesmí. Tady jde o převod tvaru
-- při migraci schématu, ne o změnu obsahu - text úkonu ani bodů se nemění.
-- Zámek se proto na dobu převodu vypne a hned zase zapne.
-- -----------------------------------------------------------------------------

alter table public.sablona_ukon disable trigger sablona_ukon_zamek;

update public.sablona_ukon
set kontrolni_body = (
  select coalesce(jsonb_agg(jsonb_build_object('nazev', bod, 'typ', 'hodnota')), '[]'::jsonb)
  from jsonb_array_elements_text(kontrolni_body) as prvek(bod)
  where length(btrim(bod)) > 0
)
where jsonb_typeof(kontrolni_body) = 'array'
  and exists (
    select 1 from jsonb_array_elements(kontrolni_body) as prvek(bod)
    where jsonb_typeof(prvek.bod) = 'string'
  );

-- Řádky, kde po očištění nezbylo nic, mají po agregaci NULL místo prázdného pole.
update public.sablona_ukon set kontrolni_body = '[]'::jsonb where kontrolni_body is null;

alter table public.sablona_ukon enable trigger sablona_ukon_zamek;

-- -----------------------------------------------------------------------------
-- Omezení
-- -----------------------------------------------------------------------------

alter table public.sablona_ukon
  add constraint sablona_ukon_kontrolni_body_maji_tvar
  check (public.jsou_platne_kontrolni_body(kontrolni_body));

grant execute on function public.jsou_platne_kontrolni_body(jsonb) to authenticated;
