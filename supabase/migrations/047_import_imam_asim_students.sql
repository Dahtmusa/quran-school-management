-- Migration 047: Import students for Shu'batu Imam Asim
-- Source: physical class register, First Term 2026/27 (Year 2 of programme)
-- S/N 19 blank. Teacher: Ummusalma Abubakar.

INSERT INTO public.classes (name, code) VALUES
  ('Shu''batu Imam Asim', 'SHU-IMAM-ASIM')
ON CONFLICT (code) DO NOTHING;

WITH cls AS (SELECT id FROM public.classes WHERE code = 'SHU-IMAM-ASIM')
INSERT INTO public.students (admission_no, full_name, gender, section, program_year, admission_date, class_id)
SELECT v.admission_no, v.full_name, 'female', 'boarding'::public.section_type, 'year_2'::public.program_year, '2025-09-01', cls.id
FROM cls, (VALUES
  ('AMQM/2025/131', 'Aisha Hussaini'),
  ('AMQM/2025/132', 'Aisha Isa Umar'),
  ('AMQM/2025/133', 'Aisha Muhammad'),
  ('AMQM/2025/134', 'Aisha Musa Abdullahi'),
  ('AMQM/2025/135', 'Aisha Yahaya'),
  ('AMQM/2025/136', 'Bilkisu Ibrahim'),
  ('AMQM/2025/137', 'Fatima Ali Muhammad'),
  ('AMQM/2025/138', 'Fatima Isa Umar'),
  ('AMQM/2025/139', 'Hauwa Sa''ad Ahmad'),
  ('AMQM/2025/140', 'Ikilima Ibrahim Abubakar'),
  ('AMQM/2025/141', 'Maryam Ahmad Aliyu'),
  ('AMQM/2025/142', 'Maryam Sale Adamu'),
  ('AMQM/2025/143', 'Rukayya Umar'),
  ('AMQM/2025/144', 'Rumaysa''u Musa Abdullahi'),
  ('AMQM/2025/145', 'Saudat Salisu Abdullahi'),
  ('AMQM/2025/146', 'Yahanasu Aminu Abubakar'),
  ('AMQM/2025/147', 'Amina Abdulhamida M.'),
  ('AMQM/2025/148', 'Naima Abdullahi')
) AS v(admission_no, full_name)
ON CONFLICT (admission_no) DO NOTHING;

NOTIFY pgrst, 'reload schema';
