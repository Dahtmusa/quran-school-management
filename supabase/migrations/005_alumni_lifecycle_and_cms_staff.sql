-- Alumni lifecycle, graduation certificates and admin-controlled public staff profiles.

-- Prevent duplicate alumni records for the same student.
create unique index if not exists alumni_student_unique_idx
  on public.alumni_profiles(student_id)
  where student_id is not null;

create policy "admins manage alumni" on public.alumni_profiles
  for all to authenticated
  using (public.my_role() in ('super_admin','admin','principal'))
  with check (public.my_role() in ('super_admin','admin','principal'));

create policy "admins manage certificates" on public.graduation_certificates
  for all to authenticated
  using (public.my_role() in ('super_admin','admin','principal'))
  with check (public.my_role() in ('super_admin','admin','principal'));

-- Keep the student's final official Quran position and graduation state in one transaction.
create or replace function public.finalize_year2_graduation()
returns trigger
language plpgsql
security invoker
as $$
declare
  approved_count integer;
  final_term_number smallint;
  s record;
  final_eval record;
  alumni_id uuid;
  certificate_no text;
  direction public.memorization_direction;
  final_global integer;
  final_required integer;
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    select t.term_number into final_term_number
    from public.terms t where t.id = new.term_id;

    if final_term_number = 3 then
      select * into s from public.students where id = new.student_id for update;

      if s.program_year = 'year_2' then
        select count(*) into approved_count
        from public.evaluations e
        where e.student_id = new.student_id
          and e.term_id = new.term_id
          and e.status = 'approved'
          and e.evaluation_number in (1,2,3);

        if approved_count = 3 then
          -- Always use Evaluation 3 as the final academic position, regardless of
          -- which of the three evaluations happened to be approved last.
          select * into final_eval
          from public.evaluations e
          where e.student_id = new.student_id
            and e.term_id = new.term_id
            and e.evaluation_number = 3
            and e.status = 'approved';

          select memorization_direction into direction
          from public.students where id = new.student_id;

          select global_ayah into final_global
          from public.quran_verses
          where surah = final_eval.to_surah and ayah = final_eval.to_ayah;

          final_required := case when direction = 'baqarah_to_nas' then 6236 else 1 end;

          -- Graduation/certificate requires completion of the configured Quran path.
          if final_global = final_required then
            update public.students set status = 'graduated' where id = new.student_id;

            insert into public.alumni_profiles (
              student_id, full_name, graduation_year, cohort_name, graduation_term,
              final_quran_position, completion_percentage, profile_photo_url,
              brief_bio, published, published_on_homepage
            ) values (
              s.id, s.full_name, extract(year from current_date)::int,
              'Cohort ' || extract(year from current_date)::int, 'Term 3',
              final_eval.to_surah::text || ':' || final_eval.to_ayah::text,
              100, s.photo_url,
              'Graduate of the Two-Year Quran Memorization Programme.', false, false
            )
            on conflict (student_id) do update set
              full_name = excluded.full_name,
              final_quran_position = excluded.final_quran_position,
              completion_percentage = excluded.completion_percentage,
              updated_at = now()
            returning id into alumni_id;

            certificate_no := 'ALH-' || extract(year from current_date)::int || '-' || upper(substr(replace(s.admission_no,'-',''),1,8));

            insert into public.graduation_certificates (
              alumni_id, certificate_number, issued_at, recipient_name,
              programme_name, cohort_name, final_term, status
            ) values (
              alumni_id, certificate_no, current_date, s.full_name,
              'Two-Year Quran Memorization Programme',
              'Cohort ' || extract(year from current_date)::int,
              'Term 3', 'issued'
            ) on conflict (certificate_number) do nothing;
          end if;
        end if;
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists finalize_year2_graduation on public.evaluations;
create trigger finalize_year2_graduation
after update on public.evaluations
for each row execute function public.finalize_year2_graduation();
