-- Scoring is no longer part of the dreambook. Remove all score data and API objects.

drop view if exists public."SM_vote_totals";
drop function if exists public.sm_record_vote(uuid, uuid, smallint);
drop table if exists public."SM_votes";
