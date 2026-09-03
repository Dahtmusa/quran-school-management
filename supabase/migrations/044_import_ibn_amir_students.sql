-- Migration 044: Import students for Shu'batu Ibn Amir (I)
-- Source: physical class register, First Term 2026/27 (Year 2 of programme)
-- S/N 28-30 are blank. Teacher: Umar Muhammad.

-- Ensure class exists
INSERT INTO public.classes (name, code) VALUES
  ('Shu''batu Ibn Amir (I)', 'SHU-IBN-AMIR-I')
ON CONFLICT (code) DO NOTHING;

-- Insert students (all male, year_2, boarding default)
WITH cls AS (SELECT id FROM public.classes WHERE code = 'SHU-IBN-AMIR-I')
INSERT INTO public.students (admission_no, full_name, gender, section, program_year, admission_date, class_id)
SELECT v.admission_no, v.full_name, 'male', 'boarding'::public.section_type, 'year_2'::public.program_year, '2025-09-01', cls.id
FROM cls, (VALUES
  ('AMQM/2025/053', 'Abduljabbar M. Murtala'),
  ('AMQM/2025/054', 'Abdullahi Musa Abdullahi'),
  ('AMQM/2025/055', 'Abdurrahman Usman'),
  ('AMQM/2025/056', 'Abdurrashid Sani'),
  ('AMQM/2025/057', 'Abubakar Sadiq Abdullahi'),
  ('AMQM/2025/058', 'Abubakar Sadiq Umar'),
  ('AMQM/2025/059', 'Adam Ahmad'),
  ('AMQM/2025/060', 'Adamu Musa'),
  ('AMQM/2025/061', 'Ahmad Abdul-Wahid Shomi'),
  ('AMQM/2025/062', 'Ahmad Ishaq'),
  ('AMQM/2025/063', 'Ahmad Muhammad'),
  ('AMQM/2025/064', 'Ahmad Muhammad Bello'),
  ('AMQM/2025/065', 'Al-Amin Abdul-Aziz'),
  ('AMQM/2025/066', 'Arwan Isa Hussaini'),
  ('AMQM/2025/067', 'Bello Abdullahi Bello'),
  ('AMQM/2025/068', 'Fadil Bello'),
  ('AMQM/2025/069', 'Faruq Muhammad Umar'),
  ('AMQM/2025/070', 'Hamza Ibrahim'),
  ('AMQM/2025/071', 'Haruna Usman'),
  ('AMQM/2025/072', 'Hussaini Ishaq'),
  ('AMQM/2025/073', 'Idris Muh''d Mu''azu'),
  ('AMQM/2025/074', 'Ja''afar Habib'),
  ('AMQM/2025/075', 'Muhammad Umar Inuwa'),
  ('AMQM/2025/076', 'Nabil Lawan Bello'),
  ('AMQM/2025/077', 'Nasruddeen Muhammad Umar'),
  ('AMQM/2025/078', 'Ridwan Ibrahim Mamman'),
  ('AMQM/2025/079', 'Abubakar Sulaiman')
) AS v(admission_no, full_name)
ON CONFLICT (admission_no) DO NOTHING;

NOTIFY pgrst, 'reload schema';
