-- Main-gate attendance policy:
-- The gate scanner is for day students and staff only.
-- Boarding student attendance is recorded by teachers from the teacher dashboard.
UPDATE public.attendance_scan_points
SET is_active = CASE WHEN lower(trim(name)) = 'main gate' THEN true ELSE false END
WHERE lower(trim(name)) IN ('main gate','boarding');

INSERT INTO public.attendance_scan_points (name, description, is_active)
SELECT 'Main Gate', 'AMQM main entrance scanner for day students and staff.', true
WHERE NOT EXISTS (
  SELECT 1 FROM public.attendance_scan_points WHERE lower(trim(name)) = 'main gate'
);

UPDATE public.attendance_scan_points
SET is_active = true,
    description = COALESCE(NULLIF(trim(description), ''), 'AMQM main entrance scanner for day students and staff.')
WHERE lower(trim(name)) = 'main gate';