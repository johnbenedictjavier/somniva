-- Persist award nominees, make podium and vote membership safe, and move story
-- placement into transaction-safe database functions.

create table if not exists public."SM_award_nominees" (
    id uuid primary key default gen_random_uuid(),
    award_id uuid not null references public."SM_awards"(id) on delete cascade,
    story_id uuid not null references public."SM_stories"(id) on delete cascade,
    created_at timestamptz not null default now(),
    unique (award_id, story_id)
);

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conrelid = 'public."SM_award_nominees"'::regclass
          and conname = 'SM_award_nominees_award_id_story_id_key'
    ) then
        alter table public."SM_award_nominees"
            add constraint "SM_award_nominees_award_id_story_id_key"
            unique (award_id, story_id);
    end if;
end;
$$;

create index if not exists "SM_award_nominees_award_idx"
    on public."SM_award_nominees" (award_id, created_at, story_id);

-- Preserve all current podium choices and all current scores before membership
-- constraints are installed. Winners are the required backfill; voted stories
-- are retained as nominees as well so no existing score is lost.
insert into public."SM_award_nominees" (award_id, story_id)
select award_id, story_id
from public."SM_award_winners"
on conflict (award_id, story_id) do nothing;

insert into public."SM_award_nominees" (award_id, story_id)
select award_id, story_id
from public."SM_votes"
on conflict (award_id, story_id) do nothing;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conrelid = 'public."SM_award_winners"'::regclass
          and conname = 'SM_award_winners_award_id_story_id_nominee_fkey'
    ) then
        alter table public."SM_award_winners"
            add constraint "SM_award_winners_award_id_story_id_nominee_fkey"
            foreign key (award_id, story_id)
            references public."SM_award_nominees"(award_id, story_id)
            on delete cascade;
    end if;

    if not exists (
        select 1
        from pg_constraint
        where conrelid = 'public."SM_votes"'::regclass
          and conname = 'SM_votes_award_id_story_id_nominee_fkey'
    ) then
        alter table public."SM_votes"
            add constraint "SM_votes_award_id_story_id_nominee_fkey"
            foreign key (award_id, story_id)
            references public."SM_award_nominees"(award_id, story_id)
            on delete cascade;
    end if;
end;
$$;

alter table public."SM_award_nominees" enable row level security;

drop policy if exists "SM nominees public read" on public."SM_award_nominees";
drop policy if exists "SM nominees admin insert" on public."SM_award_nominees";
drop policy if exists "SM nominees admin update" on public."SM_award_nominees";
drop policy if exists "SM nominees admin delete" on public."SM_award_nominees";

revoke all on public."SM_award_nominees" from anon, authenticated;

create or replace function public.sm_alpha_suffix(p_index integer)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
    value integer := p_index;
    suffix text := '';
begin
    while value > 0 loop
        value := value - 1;
        suffix := chr(97 + (value % 26)) || suffix;
        value := floor(value / 26);
    end loop;
    return suffix;
end;
$$;

create or replace function public.sm_renumber_stories()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    perform pg_advisory_xact_lock(742991331::bigint);

    drop table if exists pg_temp.sm_story_placements;
    create temporary table sm_story_placements on commit drop as
    select
        current_story.id,
        dense_rank() over (order by current_story.dream_date)::integer as page_number,
        row_number() over (
            partition by current_story.dream_date
            order by current_story.created_at asc, current_story.page_number asc, current_story.link asc, current_story.id asc
        )::integer as story_index
    from public."SM_stories" as current_story;

    update public."SM_stories"
    set link = '__somniva_renumber__' || id::text;

    update public."SM_stories" as story
    set
        page_number = placement.page_number,
        link = 'p' || placement.page_number::text || public.sm_alpha_suffix(placement.story_index - 1),
        updated_at = now()
    from pg_temp.sm_story_placements as placement
    where story.id = placement.id;
end;
$$;

create or replace function public.sm_create_story(
    p_title text,
    p_dream_date date,
    p_paragraphs jsonb,
    p_image_prompt text default '',
    p_image_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    created_story public."SM_stories";
begin
    if jsonb_typeof(p_paragraphs) <> 'array' or jsonb_array_length(p_paragraphs) = 0 then
        raise exception 'At least one paragraph is required.';
    end if;

    perform pg_advisory_xact_lock(742991331::bigint);

    insert into public."SM_stories" (
        title, page_number, link, dream_date, paragraphs, image_path, image_prompt, published
    )
    values (
        p_title,
        1,
        '__somniva_pending__' || gen_random_uuid()::text,
        p_dream_date,
        p_paragraphs,
        p_image_path,
        coalesce(p_image_prompt, ''),
        true
    )
    returning * into created_story;

    perform public.sm_renumber_stories();

    select * into created_story
    from public."SM_stories" as story
    where story.id = created_story.id;
    return to_jsonb(created_story);
end;
$$;

create or replace function public.sm_update_story(
    p_story_id uuid,
    p_title text,
    p_dream_date date,
    p_paragraphs jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    updated_story public."SM_stories";
begin
    if jsonb_typeof(p_paragraphs) <> 'array' or jsonb_array_length(p_paragraphs) = 0 then
        raise exception 'At least one paragraph is required.';
    end if;

    perform pg_advisory_xact_lock(742991331::bigint);

    update public."SM_stories"
    set title = p_title, dream_date = p_dream_date, paragraphs = p_paragraphs, updated_at = now()
    where id = p_story_id
    returning * into updated_story;

    if not found then
        raise exception 'Story was not found.';
    end if;

    perform public.sm_renumber_stories();

    select * into updated_story
    from public."SM_stories" as story
    where story.id = p_story_id;
    return to_jsonb(updated_story);
end;
$$;

create or replace function public.sm_delete_story(p_story_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    deleted_story public."SM_stories";
begin
    perform pg_advisory_xact_lock(742991331::bigint);

    select * into deleted_story
    from public."SM_stories"
    where id = p_story_id
    for update;

    if not found then
        raise exception 'Story was not found.';
    end if;

    delete from public."SM_stories" where id = p_story_id;
    perform public.sm_renumber_stories();
    return to_jsonb(deleted_story);
end;
$$;

create or replace function public.sm_replace_award_nominees(
    p_award_id uuid,
    p_story_ids uuid[]
)
returns setof public."SM_award_nominees"
language plpgsql
security definer
set search_path = public
as $$
declare
    requested_ids uuid[] := coalesce(p_story_ids, array[]::uuid[]);
    requested_count integer := coalesce(array_length(requested_ids, 1), 0);
    nominee public."SM_award_nominees";
begin
    perform 1
    from public."SM_awards"
    where id = p_award_id
    for update;
    if not found then
        raise exception 'Award was not found.';
    end if;

    if requested_count <> (
        select count(*)
        from (select distinct story_id from unnest(requested_ids) as ids(story_id)) as distinct_ids
    ) then
        raise exception 'Nominees cannot contain duplicates or empty IDs.';
    end if;

    if exists (
        select 1
        from unnest(requested_ids) as ids(story_id)
        where story_id is null
           or not exists (select 1 from public."SM_stories" where id = ids.story_id)
    ) then
        raise exception 'Every nominee must be an existing dream.';
    end if;

    delete from public."SM_award_nominees" nominee_row
    where nominee_row.award_id = p_award_id
      and not (nominee_row.story_id = any(requested_ids));

    insert into public."SM_award_nominees" (award_id, story_id)
    select p_award_id, ids.story_id
    from unnest(requested_ids) as ids(story_id)
    on conflict (award_id, story_id) do nothing;

    for nominee in
        select * from public."SM_award_nominees"
        where award_id = p_award_id
        order by created_at asc, story_id asc
    loop
        return next nominee;
    end loop;
    return;
end;
$$;

create or replace function public.sm_set_award_winner(
    p_award_id uuid,
    p_story_id uuid,
    p_rank smallint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    award_active boolean;
    story_published boolean;
    current_slots uuid[] := array[null::uuid, null::uuid, null::uuid];
    new_slots uuid[] := array[null::uuid, null::uuid, null::uuid];
    selected_rank integer;
    source_ids uuid[] := array[]::uuid[];
    source_offset integer;
    slot_index integer;
    winner_row record;
    result_row public."SM_award_winners";
begin
    if p_rank is null or p_rank not between 1 and 3 then
        raise exception 'Winner rank is invalid.';
    end if;

    select active into award_active
    from public."SM_awards"
    where id = p_award_id
    for update;
    if not found then
        raise exception 'Award was not found.';
    end if;
    if not award_active then
        raise exception 'This award is inactive.';
    end if;

    select published into story_published
    from public."SM_stories"
    where id = p_story_id;
    if not found then
        raise exception 'Story was not found.';
    end if;
    if not story_published then
        raise exception 'This dream is not published.';
    end if;
    if not exists (
        select 1 from public."SM_award_nominees"
        where award_id = p_award_id and story_id = p_story_id
    ) then
        raise exception 'This dream is not a nominee for this award.';
    end if;

    for winner_row in
        select story_id, rank from public."SM_award_winners"
        where award_id = p_award_id order by rank for update
    loop
        current_slots[winner_row.rank] := winner_row.story_id;
    end loop;

    selected_rank := array_position(current_slots, p_story_id);
    if selected_rank is null then
        new_slots := current_slots;
        slot_index := 3;
        while slot_index > p_rank loop
            new_slots[slot_index] := current_slots[slot_index - 1];
            slot_index := slot_index - 1;
        end loop;
        new_slots[p_rank] := p_story_id;
    elsif selected_rank = p_rank then
        new_slots := current_slots;
    else
        for slot_index in selected_rank..3 loop
            if current_slots[slot_index] is not null then
                source_ids := array_append(source_ids, current_slots[slot_index]);
            end if;
        end loop;
        new_slots := array[null::uuid, null::uuid, null::uuid];
        for source_offset in 1..coalesce(array_length(source_ids, 1), 0) loop
            if p_rank + source_offset - 1 <= 3 then
                new_slots[p_rank + source_offset - 1] := source_ids[source_offset];
            end if;
        end loop;
    end if;

    delete from public."SM_award_winners" where award_id = p_award_id;
    for slot_index in 1..3 loop
        if new_slots[slot_index] is not null then
            insert into public."SM_award_winners" (award_id, story_id, rank)
            values (p_award_id, new_slots[slot_index], slot_index);
        end if;
    end loop;

    select * into result_row from public."SM_award_winners"
    where award_id = p_award_id and story_id = p_story_id;
    return to_jsonb(result_row);
end;
$$;

create or replace function public.sm_remove_award_winner(
    p_award_id uuid,
    p_rank smallint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    deleted_row public."SM_award_winners";
begin
    if p_rank is null or p_rank not between 1 and 3 then
        raise exception 'Winner rank is invalid.';
    end if;

    perform 1 from public."SM_awards" where id = p_award_id for update;
    if not found then
        raise exception 'Award was not found.';
    end if;

    delete from public."SM_award_winners"
    where award_id = p_award_id and rank = p_rank
    returning * into deleted_row;
    return to_jsonb(deleted_row);
end;
$$;

create or replace function public.sm_record_vote(
    p_award_id uuid,
    p_story_id uuid,
    p_points smallint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    vote_row public."SM_votes";
begin
    if p_points is null or p_points not between 1 and 10 then
        raise exception 'Points must be from 1 to 10.';
    end if;

    perform 1 from public."SM_awards" where id = p_award_id for update;
    if not found then
        raise exception 'Award was not found.';
    end if;
    if not exists (
        select 1 from public."SM_award_nominees"
        where award_id = p_award_id and story_id = p_story_id
    ) then
        raise exception 'This dream is not a nominee for this award.';
    end if;

    insert into public."SM_votes" (award_id, story_id, points)
    values (p_award_id, p_story_id, p_points)
    on conflict (award_id, story_id) do update
    set points = excluded.points, updated_at = now()
    returning * into vote_row;
    return to_jsonb(vote_row);
end;
$$;

revoke execute on function public.sm_alpha_suffix(integer) from public, anon, authenticated;
revoke execute on function public.sm_renumber_stories() from public, anon, authenticated;
revoke execute on function public.sm_create_story(text, date, jsonb, text, text) from public, anon, authenticated;
revoke execute on function public.sm_update_story(uuid, text, date, jsonb) from public, anon, authenticated;
revoke execute on function public.sm_delete_story(uuid) from public, anon, authenticated;
revoke execute on function public.sm_replace_award_nominees(uuid, uuid[]) from public, anon, authenticated;
revoke execute on function public.sm_set_award_winner(uuid, uuid, smallint) from public, anon, authenticated;
revoke execute on function public.sm_remove_award_winner(uuid, smallint) from public, anon, authenticated;
revoke execute on function public.sm_record_vote(uuid, uuid, smallint) from public, anon, authenticated;
grant execute on function public.sm_create_story(text, date, jsonb, text, text) to service_role;
grant execute on function public.sm_update_story(uuid, text, date, jsonb) to service_role;
grant execute on function public.sm_delete_story(uuid) to service_role;
grant execute on function public.sm_replace_award_nominees(uuid, uuid[]) to service_role;
grant execute on function public.sm_set_award_winner(uuid, uuid, smallint) to service_role;
grant execute on function public.sm_remove_award_winner(uuid, smallint) to service_role;
grant execute on function public.sm_record_vote(uuid, uuid, smallint) to service_role;

-- Normalize existing links once. The function uses a temporary namespace first,
-- so unique links never conflict while pages are being recomputed.
select public.sm_renumber_stories();
