-- Lock the existing Somniva collection behind the password-only Edge Function.

alter table public."SM_stories"
    add column if not exists image_prompt text not null default '';

drop policy if exists "SM votes public read" on public."SM_votes";
drop policy if exists "SM votes own insert" on public."SM_votes";
drop policy if exists "SM votes own update" on public."SM_votes";
drop policy if exists "SM votes own delete" on public."SM_votes";

alter table public."SM_votes"
    drop constraint if exists "SM_votes_award_id_story_id_voter_id_key";

alter table public."SM_votes"
    drop column if exists voter_id;

alter table public."SM_votes"
    add constraint "SM_votes_award_id_story_id_key" unique (award_id, story_id);

update storage.buckets
set public = false
where id = 'SM_story_images';

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
