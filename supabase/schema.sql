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

create table if not exists public."SM_award_winners" (
    id uuid primary key default gen_random_uuid(),
    award_id uuid not null references public."SM_awards"(id) on delete cascade,
    story_id uuid not null references public."SM_stories"(id) on delete cascade,
    rank smallint not null check (rank between 1 and 3),
    created_at timestamptz not null default now(),
    unique (award_id, rank),
    unique (award_id, story_id)
);

create table if not exists public."SM_votes" (
    id uuid primary key default gen_random_uuid(),
    award_id uuid not null references public."SM_awards"(id) on delete cascade,
    story_id uuid not null references public."SM_stories"(id) on delete cascade,
    points smallint not null check (points between 1 and 10),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (award_id, story_id)
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
create index if not exists "SM_votes_story_award_idx"
    on public."SM_votes" (story_id, award_id);

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

drop trigger if exists "SM_stories_updated_at" on public."SM_stories";
create trigger "SM_stories_updated_at"
before update on public."SM_stories"
for each row execute function public.sm_set_updated_at();

drop trigger if exists "SM_awards_updated_at" on public."SM_awards";
create trigger "SM_awards_updated_at"
before update on public."SM_awards"
for each row execute function public.sm_set_updated_at();

drop trigger if exists "SM_votes_updated_at" on public."SM_votes";
create trigger "SM_votes_updated_at"
before update on public."SM_votes"
for each row execute function public.sm_set_updated_at();

alter table public."SM_stories" enable row level security;
alter table public."SM_awards" enable row level security;
alter table public."SM_award_winners" enable row level security;
alter table public."SM_votes" enable row level security;
alter table public."SM_admins" enable row level security;

create or replace view public."SM_vote_totals" as
select
    award_id,
    story_id,
    count(*)::integer as vote_count,
    coalesce(sum(points), 0)::integer as total_points,
    round(avg(points)::numeric, 2) as average_points
from public."SM_votes"
group by award_id, story_id;

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
drop policy if exists "SM winners public read" on public."SM_award_winners";
drop policy if exists "SM winners admin insert" on public."SM_award_winners";
drop policy if exists "SM winners admin update" on public."SM_award_winners";
drop policy if exists "SM winners admin delete" on public."SM_award_winners";
drop policy if exists "SM votes public read" on public."SM_votes";
drop policy if exists "SM votes own insert" on public."SM_votes";
drop policy if exists "SM votes own update" on public."SM_votes";
drop policy if exists "SM votes own delete" on public."SM_votes";
drop policy if exists "SM admins self read" on public."SM_admins";
drop policy if exists "SM story images public read" on storage.objects;
drop policy if exists "SM story images admin insert" on storage.objects;
drop policy if exists "SM story images admin update" on storage.objects;
drop policy if exists "SM story images admin delete" on storage.objects;

revoke all on public."SM_stories" from anon, authenticated;
revoke all on public."SM_awards" from anon, authenticated;
revoke all on public."SM_award_winners" from anon, authenticated;
revoke all on public."SM_votes" from anon, authenticated;
revoke all on public."SM_admins" from anon, authenticated;
revoke all on public."SM_vote_totals" from anon, authenticated;
revoke execute on function public.sm_is_admin() from anon, authenticated;
