-- Migration 049: Create Shu'batu Imam Kisa'i class and add first student

INSERT INTO public.classes (name, code) VALUES
  ('Shu''batu Imam Kisa''i', 'SHU-IMAM-KISAI')
ON CONFLICT (code) DO NOTHING;

WITH cls AS (SELECT id FROM public.classes WHERE code = 'SHU-IMAM-KISAI')
INSERT INTO public.students (admission_no, full_name, gender, section, program_year, admission_date, class_id)
SELECT 'AMQM/2025/177', 'Amatullahi Umar Musa', 'female', 'boarding'::public.section_type, 'year_2'::public.program_year, '2025-09-01', cls.id
FROM cls
ON CONFLICT (admission_no) DO NOTHING;

NOTIFY pgrst, 'reload schema';
