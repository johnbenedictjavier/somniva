-- Keep the temporary link reset compatible with Supabase safe-update checks.

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

revoke execute on function public.sm_renumber_stories() from public, anon, authenticated;
grant execute on function public.sm_renumber_stories() to service_role;
