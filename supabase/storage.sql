-- ---------------------------------------------------------------------------
-- Storage policies for the agenda-files bucket
-- ---------------------------------------------------------------------------
-- Run this in the Supabase SQL editor if uploading a flyer or an agenda PDF
-- fails with:
--
--     new row violates row-level security policy
--
-- Creating a bucket does not grant anyone the right to write to it. Storage
-- keeps its files in storage.objects, which has row-level security of its own,
-- and until a policy allows the insert every upload is refused — which is what
-- that error is saying.
--
-- Three rules, matching how the app is used:
--   * anyone may READ    — members open flyers and PDFs without an account
--   * presidency may WRITE — only signed-in presidency can upload or delete
--
-- Safe to run more than once.
-- ---------------------------------------------------------------------------

-- The bucket itself, public for reads. Harmless if it already exists.
insert into storage.buckets (id, name, public)
values ('agenda-files', 'agenda-files', true)
on conflict (id) do update set public = true;

do $$
begin
  -- Anyone with the link can view. This is what makes a flyer show up for a
  -- member who has never signed in, and what lets Messages fetch it for a
  -- link preview.
  execute 'drop policy if exists "Public reads agenda files" on storage.objects';
  execute $p$
    create policy "Public reads agenda files" on storage.objects
      for select using (bucket_id = 'agenda-files')
  $p$;

  -- Writing is presidency-only. Note public.is_presidency() is schema-qualified:
  -- a storage policy does not run with the public schema on its search path.
  execute 'drop policy if exists "Presidency uploads agenda files" on storage.objects';
  execute $p$
    create policy "Presidency uploads agenda files" on storage.objects
      for insert to authenticated
      with check (bucket_id = 'agenda-files' and public.is_presidency())
  $p$;

  -- Replacing a flyer overwrites in place, so update needs its own policy.
  execute 'drop policy if exists "Presidency updates agenda files" on storage.objects';
  execute $p$
    create policy "Presidency updates agenda files" on storage.objects
      for update to authenticated
      using (bucket_id = 'agenda-files' and public.is_presidency())
      with check (bucket_id = 'agenda-files' and public.is_presidency())
  $p$;

  execute 'drop policy if exists "Presidency deletes agenda files" on storage.objects';
  execute $p$
    create policy "Presidency deletes agenda files" on storage.objects
      for delete to authenticated
      using (bucket_id = 'agenda-files' and public.is_presidency())
  $p$;

exception
  -- Some projects don't let the SQL editor own storage.objects. Rather than
  -- failing the whole script, say so and point at the dashboard, where the
  -- same four rules can be added by hand.
  when insufficient_privilege then
    raise notice 'Could not create storage policies from SQL. Add them in Supabase → Storage → agenda-files → Policies instead: SELECT for everyone, and INSERT/UPDATE/DELETE for authenticated users where public.is_presidency().';
end
$$;

-- Expect "Success. No rows returned." Then try the upload again.
