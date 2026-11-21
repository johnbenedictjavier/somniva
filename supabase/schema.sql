-- Somniva / The Mystery database schema.
-- Run this file in the Supabase SQL Editor before seed.sql.

create extension if not exists pgcrypto;

create table if not exists public."SM_stories" (
    id uuid primary key default gen_random_uuid(),
    title text not null,
    page_number integer not null check (page_number > 0),
    link text not null unique,
    dream_date date not null default current_date,
    paragraphs jsonb not null default '[]'::jsonb check (jsonb_typeof(paragraphs) = 'array'),
    comments jsonb not null default '[]'::jsonb check (jsonb_typeof(comments) = 'array'),
    image_path text,
    image_prompt text not null default '',
    published boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public."SM_awards" (
    id uuid primary key default gen_random_uuid(),
    name text not null unique,
    description text not null default '',
    display_order integer not null default 0,
    active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public."SM_award_nominees" (
    id uuid primary key default gen_random_uuid(),
    award_id uuid not null references public."SM_awards"(id) on delete cascade,
    story_id uuid not null references public."SM_stories"(id) on delete cascade,
    created_at timestamptz not null default now(),
    unique (award_id, story_id)
);

create table if not exists public."SM_award_winners" (
    id uuid primary key default gen_random_uuid(),
    award_id uuid not null references public."SM_awards"(id) on delete cascade,
    story_id uuid not null references public."SM_stories"(id) on delete cascade,
    rank smallint not null check (rank between 1 and 3),
    created_at timestamptz not null default now(),
    unique (award_id, rank),
    unique (award_id, story_id),
    foreign key (award_id, story_id)
        references public."SM_award_nominees"(award_id, story_id)
        on delete cascade
);

create table if not exists public."SM_admins" (
    user_id uuid primary key references auth.users(id) on delete cascade,
    created_at timestamptz not null default now()
);

create index if not exists "SM_stories_title_idx"
    on public."SM_stories" (lower(title));
create index if not exists "SM_stories_page_idx"
    on public."SM_stories" (page_number, link);
create index if not exists "SM_stories_date_idx"
    on public."SM_stories" (dream_date desc, created_at desc);
create index if not exists "SM_award_nominees_award_idx"
    on public."SM_award_nominees" (award_id, created_at, story_id);
create or replace function public.sm_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create or replace function public.sm_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public."SM_admins"
        where user_id = auth.uid()
    );
$$;

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

    -- Move every link out of the final namespace before assigning new links.
    update public."SM_stories" as story
    set link = '__somniva_renumber__' || story.id::text
    where story.id is not null;

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
        title,
        page_number,
        link,
        dream_date,
        paragraphs,
        image_path,
        image_prompt,
        published
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
    set
        title = p_title,
        dream_date = p_dream_date,
        paragraphs = p_paragraphs,
        updated_at = now()
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

    delete from public."SM_stories"
    where id = p_story_id;

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
        select *
        from public."SM_award_nominees"
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
        select 1
        from public."SM_award_nominees"
        where award_id = p_award_id and story_id = p_story_id
    ) then
        raise exception 'This dream is not a nominee for this award.';
    end if;

    for winner_row in
        select story_id, rank
        from public."SM_award_winners"
        where award_id = p_award_id
        order by rank
        for update
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

    delete from public."SM_award_winners"
    where award_id = p_award_id;

    for slot_index in 1..3 loop
        if new_slots[slot_index] is not null then
            insert into public."SM_award_winners" (award_id, story_id, rank)
            values (p_award_id, new_slots[slot_index], slot_index);
        end if;
    end loop;

    select * into result_row
    from public."SM_award_winners"
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

    perform 1
    from public."SM_awards"
    where id = p_award_id
    for update;
    if not found then
        raise exception 'Award was not found.';
    end if;

    delete from public."SM_award_winners"
    where award_id = p_award_id and rank = p_rank
    returning * into deleted_row;
    return to_jsonb(deleted_row);
end;
$$;

drop trigger if exists "SM_stories_updated_at" on public."SM_stories";
create trigger "SM_stories_updated_at"
before update on public."SM_stories"
for each row execute function public.sm_set_updated_at();

drop trigger if exists "SM_awards_updated_at" on public."SM_awards";
create trigger "SM_awards_updated_at"
before update on public."SM_awards"
for each row execute function public.sm_set_updated_at();

alter table public."SM_stories" enable row level security;
alter table public."SM_awards" enable row level security;
alter table public."SM_award_nominees" enable row level security;
alter table public."SM_award_winners" enable row level security;
alter table public."SM_admins" enable row level security;

insert into storage.buckets (id, name, public)
values ('SM_story_images', 'SM_story_images', false)
on conflict (id) do update set public = false;

-- The browser never reads Supabase directly. The password-protected Edge Function
-- uses the service role to read these tables and create signed image URLs.
alter table public."SM_stories" add column if not exists image_prompt text not null default '';
alter table storage.buckets alter column public set default false;
update storage.buckets set public = false where id = 'SM_story_images';

drop policy if exists "SM stories public read" on public."SM_stories";
drop policy if exists "SM stories admin insert" on public."SM_stories";
drop policy if exists "SM stories admin update" on public."SM_stories";
drop policy if exists "SM stories admin delete" on public."SM_stories";
drop policy if exists "SM awards public read" on public."SM_awards";
drop policy if exists "SM awards admin insert" on public."SM_awards";
drop policy if exists "SM awards admin update" on public."SM_awards";
drop policy if exists "SM awards admin delete" on public."SM_awards";
drop policy if exists "SM nominees public read" on public."SM_award_nominees";
drop policy if exists "SM nominees admin insert" on public."SM_award_nominees";
drop policy if exists "SM nominees admin update" on public."SM_award_nominees";
drop policy if exists "SM nominees admin delete" on public."SM_award_nominees";
drop policy if exists "SM winners public read" on public."SM_award_winners";
drop policy if exists "SM winners admin insert" on public."SM_award_winners";
drop policy if exists "SM winners admin update" on public."SM_award_winners";
drop policy if exists "SM winners admin delete" on public."SM_award_winners";
drop policy if exists "SM admins self read" on public."SM_admins";
drop policy if exists "SM story images public read" on storage.objects;
drop policy if exists "SM story images admin insert" on storage.objects;
drop policy if exists "SM story images admin update" on storage.objects;
drop policy if exists "SM story images admin delete" on storage.objects;

revoke all on public."SM_stories" from anon, authenticated;
revoke all on public."SM_awards" from anon, authenticated;
revoke all on public."SM_award_nominees" from anon, authenticated;
revoke all on public."SM_award_winners" from anon, authenticated;
revoke all on public."SM_admins" from anon, authenticated;
revoke execute on function public.sm_is_admin() from anon, authenticated;
revoke execute on function public.sm_alpha_suffix(integer) from public, anon, authenticated;
revoke execute on function public.sm_renumber_stories() from public, anon, authenticated;
revoke execute on function public.sm_create_story(text, date, jsonb, text, text) from public, anon, authenticated;
revoke execute on function public.sm_update_story(uuid, text, date, jsonb) from public, anon, authenticated;
revoke execute on function public.sm_delete_story(uuid) from public, anon, authenticated;
revoke execute on function public.sm_replace_award_nominees(uuid, uuid[]) from public, anon, authenticated;
revoke execute on function public.sm_set_award_winner(uuid, uuid, smallint) from public, anon, authenticated;
revoke execute on function public.sm_remove_award_winner(uuid, smallint) from public, anon, authenticated;
grant execute on function public.sm_create_story(text, date, jsonb, text, text) to service_role;
grant execute on function public.sm_update_story(uuid, text, date, jsonb) to service_role;
grant execute on function public.sm_delete_story(uuid) to service_role;
grant execute on function public.sm_replace_award_nominees(uuid, uuid[]) to service_role;
grant execute on function public.sm_set_award_winner(uuid, uuid, smallint) to service_role;
grant execute on function public.sm_remove_award_winner(uuid, smallint) to service_role;
