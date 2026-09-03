-- Migration 046: Import students for Shu'batu Abu Amr
-- Source: physical class register, First Term 2026/27 (Year 2 of programme)
-- S/N 28-29 blank. S/N 30 (Buhari Hayatu) handwritten addition included.
-- Teacher: Usman.

-- Ensure class exists
INSERT INTO public.classes (name, code) VALUES
  ('Shu''batu Abu Amr', 'SHU-ABU-AMR')
ON CONFLICT (code) DO NOTHING;

-- Insert students (all male, year_2, boarding default)
WITH cls AS (SELECT id FROM public.classes WHERE code = 'SHU-ABU-AMR')
INSERT INTO public.students (admission_no, full_name, gender, section, program_year, admission_date, class_id)
SELECT v.admission_no, v.full_name, 'male', 'boarding'::public.section_type, 'year_2'::public.program_year, '2025-09-01', cls.id
FROM cls, (VALUES
  ('AMQM/2025/103', 'Abdul Ahad Umar Ladan'),
  ('AMQM/2025/104', 'Abdulhameed Salisu Idris'),
  ('AMQM/2025/105', 'Abubakar Ibrahim Alhassan'),
  ('AMQM/2025/106', 'Abubakar Muhammad Yahya'),
  ('AMQM/2025/107', 'Ahmad Nuhu'),
  ('AMQM/2025/108', 'Bello Ahmad Aliyu'),
  ('AMQM/2025/109', 'Hafiz Ibrahim'),
  ('AMQM/2025/110', 'Ibrahim Haruna Abdullahi'),
  ('AMQM/2025/111', 'Ibrahim Salisu'),
  ('AMQM/2025/112', 'Ismail Muhammad Ismail'),
  ('AMQM/2025/113', 'Ja''afar Bashir Ajuji'),
  ('AMQM/2025/114', 'Ma''asirana B. Abubakar'),
  ('AMQM/2025/115', 'Muh''d Kamil Al-Amin'),
  ('AMQM/2025/116', 'Muhammad Inuwa Gana'),
  ('AMQM/2025/117', 'Muhammad Kabir Umar'),
  ('AMQM/2025/118', 'Muhammad Sani Muh''d'),
  ('AMQM/2025/119', 'Muhammad Usman Shuwa'),
  ('AMQM/2025/120', 'Shafi''u Jamilu'),
  ('AMQM/2025/121', 'Umar Yahaya Abdullahi'),
  ('AMQM/2025/122', 'Umar Anwar Fullata'),
  ('AMQM/2025/123', 'Umar Muh''d Saroma'),
  ('AMQM/2025/124', 'Usman Abdulhameed'),
  ('AMQM/2025/125', 'Usman Abubakar'),
  ('AMQM/2025/126', 'Yusuf Ibrahim Isa'),
  ('AMQM/2025/127', 'Ibrahim Ahmad'),
  ('AMQM/2025/128', 'Umar Muhammad Yahaya'),
  ('AMQM/2025/129', 'Ibrahim Hassan Julde'),
  ('AMQM/2025/130', 'Buhari Hayatu')
) AS v(admission_no, full_name)
ON CONFLICT (admission_no) DO NOTHING;

NOTIFY pgrst, 'reload schema';
