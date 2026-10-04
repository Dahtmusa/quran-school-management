-- Attendance analytics RPCs. Two SECURITY DEFINER functions power the
-- new /attendance Analytics tab:
--
--   admin_attendance_daily -- daily status counts (present/late/absent/
--     excused) across a date range for a given person_type, so the UI
--     can slice by week, month and term and compute comparisons /
--     forecasts client-side.
--
--   admin_attendance_person_breakdown -- per-person totals across a
--     date range for the table at the bottom (who shows up, who
--     doesn't). Separate function because the aggregation shape is
--     different and running both in one call would hurt row counts.

CREATE OR REPLACE FUNCTION public.admin_attendance_daily(
  p_person_type text,
  p_from        date,
  p_to          date
)
RETURNS TABLE(
  attendance_date date,
  present         integer,
  late            integer,
  absent          integer,
  excused         integer,
  total_marked    integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ar.attendance_date,
         COUNT(*) FILTER (WHERE ar.status_code = 'present')::int,
         COUNT(*) FILTER (WHERE ar.status_code = 'late')::int,
         COUNT(*) FILTER (WHERE ar.status_code = 'absent')::int,
         COUNT(*) FILTER (WHERE ar.status_code = 'excused')::int,
         COUNT(*)::int
  FROM public.attendance_records ar
  WHERE ar.person_type = p_person_type
    AND ar.attendance_date BETWEEN p_from AND p_to
    AND (public.my_role() IN ('super_admin','admin','principal','finance','admissions')
         OR p_person_type IS NULL)
  GROUP BY ar.attendance_date
  ORDER BY ar.attendance_date;
$$;
GRANT EXECUTE ON FUNCTION public.admin_attendance_daily(text, date, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_attendance_person_breakdown(
  p_person_type text,
  p_from        date,
  p_to          date,
  p_section     text DEFAULT NULL
)
RETURNS TABLE(
  person_id     uuid,
  full_name     text,
  identifier    text,
  section       text,
  class_name    text,
  job_title     text,
  present       integer,
  late          integer,
  absent        integer,
  excused       integer,
  total_marked  integer,
  attendance_pct numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.my_role() NOT IN ('super_admin','admin','principal','finance','admissions') THEN
    RAISE EXCEPTION 'Administrator access required';
  END IF;

  IF p_person_type = 'student' THEN
    RETURN QUERY
    SELECT s.id,
           s.full_name,
           s.admission_no,
           lower(s.section::text),
           c.name,
           NULL::text,
           COUNT(ar.*) FILTER (WHERE ar.status_code = 'present')::int,
           COUNT(ar.*) FILTER (WHERE ar.status_code = 'late')::int,
           COUNT(ar.*) FILTER (WHERE ar.status_code = 'absent')::int,
           COUNT(ar.*) FILTER (WHERE ar.status_code = 'excused')::int,
           COUNT(ar.*)::int,
           CASE WHEN COUNT(ar.*) = 0 THEN 0
                ELSE ROUND(100.0 * COUNT(ar.*) FILTER (WHERE ar.status_code IN ('present','late','excused'))
                                     / COUNT(ar.*), 1) END
    FROM public.students s
    LEFT JOIN public.classes c ON c.id = s.class_id
    LEFT JOIN public.attendance_records ar
           ON ar.person_id = s.id
          AND ar.person_type = 'student'
          AND ar.attendance_date BETWEEN p_from AND p_to
    WHERE s.status = 'active'
      AND (p_section IS NULL OR lower(s.section::text) = lower(p_section))
    GROUP BY s.id, c.name
    ORDER BY s.full_name;
  ELSIF p_person_type = 'staff' THEN
    RETURN QUERY
    SELECT p.id,
           p.full_name,
           p.staff_id,
           'staff'::text,
           NULL::text,
           p.job_title,
           COUNT(ar.*) FILTER (WHERE ar.status_code = 'present')::int,
           COUNT(ar.*) FILTER (WHERE ar.status_code = 'late')::int,
           COUNT(ar.*) FILTER (WHERE ar.status_code = 'absent')::int,
           COUNT(ar.*) FILTER (WHERE ar.status_code = 'excused')::int,
           COUNT(ar.*)::int,
           CASE WHEN COUNT(ar.*) = 0 THEN 0
                ELSE ROUND(100.0 * COUNT(ar.*) FILTER (WHERE ar.status_code IN ('present','late','excused'))
                                     / COUNT(ar.*), 1) END
    FROM public.profiles p
    LEFT JOIN public.attendance_records ar
           ON ar.person_id = p.id
          AND ar.person_type = 'staff'
          AND ar.attendance_date BETWEEN p_from AND p_to
    WHERE p.employment_status = 'active'
      AND p.role NOT IN ('admin','super_admin','principal','finance','admissions','parent')
    GROUP BY p.id
    ORDER BY p.full_name;
  ELSE
    RAISE EXCEPTION 'Unknown person_type: %', p_person_type;
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_attendance_person_breakdown(text, date, date, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
