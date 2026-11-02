-- Pull the three official signatures the certificate needs directly from
-- existing staff profiles (profiles.signature_data). Teacher = the student's
-- current primary class teacher. Principal = active admin with role
-- 'principal'; falls back to the oldest active 'admin' if none. Director =
-- the super_admin.
--
-- Returned per signatory: id, full_name, job_title, signature_data (base64
-- data URL or null). Null means admin can show the printed line instead of
-- a wrong signature.

create or replace function public.amqm_alumni_full(p_alumni_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alumni public.alumni_profiles;
  v_result jsonb;
begin
  if public.my_role() not in ('super_admin','admin','principal') then
    raise exception 'Administrator access required';
  end if;

  select * into v_alumni from public.alumni_profiles where id = p_alumni_id;
  if not found then raise exception 'Alumni record not found'; end if;

  select jsonb_build_object(
    'alumni', to_jsonb(v_alumni),
    'student', (select to_jsonb(s) from public.students s where s.id = v_alumni.student_id),
    'class', (
      select jsonb_build_object('id', c.id, 'name', c.name)
        from public.students s
        join public.classes c on c.id = s.class_id
       where s.id = v_alumni.student_id
    ),
    'teacher', (
      select jsonb_build_object(
        'id', tp.id,
        'full_name', tp.full_name,
        'job_title', coalesce(tp.job_title, 'Quran Teacher'),
        'phone', tp.phone,
        'email', tp.email,
        'photo', tp.avatar_url,
        'signature_data', tp.signature_data
      )
        from public.students s
        join public.class_teachers ct on ct.class_id = s.class_id
        join public.profiles tp on tp.id = ct.teacher_id
       where s.id = v_alumni.student_id
       order by ct.is_primary desc nulls last, ct.assigned_at asc
       limit 1
    ),
    'principal', (
      select jsonb_build_object(
        'id', p.id,
        'full_name', p.full_name,
        'job_title', coalesce(p.job_title, 'Principal'),
        'signature_data', p.signature_data
      )
        from public.profiles p
       where p.employment_status = 'active'
         and p.role in ('principal','admin')
       order by case p.role when 'principal' then 0 when 'admin' then 1 else 2 end,
                p.created_at asc
       limit 1
    ),
    'director', (
      select jsonb_build_object(
        'id', p.id,
        'full_name', p.full_name,
        'job_title', coalesce(p.job_title, 'Director'),
        'signature_data', p.signature_data
      )
        from public.profiles p
       where p.employment_status = 'active'
         and p.role = 'super_admin'
       order by p.created_at asc
       limit 1
    ),
    'certificates', (
      select coalesce(jsonb_agg(to_jsonb(gc) order by gc.issued_at desc), '[]'::jsonb)
        from public.graduation_certificates gc
       where gc.alumni_id = v_alumni.id
    ),
    'evaluations', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', e.id, 'term', t.name, 'evaluation_number', e.evaluation_number,
        'status', e.status, 'from_surah', e.from_surah, 'from_ayah', e.from_ayah,
        'to_surah', e.to_surah, 'to_ayah', e.to_ayah,
        'memorization_score', e.memorization_score, 'accuracy_score', e.accuracy_score,
        'fluency_score', e.fluency_score, 'tajweed_score', e.tajweed_score,
        'retention_score', e.retention_score,
        'teacher_comment', e.teacher_comment,
        'approved_at', e.approved_at
      ) order by t.starts_on, e.evaluation_number), '[]'::jsonb)
        from public.evaluations e
        join public.terms t on t.id = e.term_id
       where e.student_id = v_alumni.student_id
    ),
    'fees', (
      select jsonb_build_object(
        'total_due', coalesce(sum(amount_due), 0),
        'total_paid', coalesce(sum(amount_paid), 0),
        'outstanding', coalesce(sum(amount_due - amount_paid), 0)
      )
        from public.student_fees
       where student_id = v_alumni.student_id
    ),
    'fee_lines', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', sf.id, 'amount_due', sf.amount_due, 'amount_paid', sf.amount_paid,
        'term', t.name, 'fee_type', fs.fee_type, 'description', fs.description
      ) order by t.starts_on desc), '[]'::jsonb)
        from public.student_fees sf
        left join public.fee_structures fs on fs.id = sf.fee_structure_id
        left join public.terms t on t.id = fs.term_id
       where sf.student_id = v_alumni.student_id
    ),
    'payments', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id, 'amount', p.amount, 'paid_on', p.paid_on, 'method', p.method
      ) order by p.paid_on desc), '[]'::jsonb)
        from public.payments p
       where p.student_id = v_alumni.student_id
    )
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function public.amqm_alumni_full(uuid) to authenticated;

notify pgrst, 'reload schema';
