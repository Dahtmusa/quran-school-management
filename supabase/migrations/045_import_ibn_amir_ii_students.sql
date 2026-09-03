-- Migration 045: Import students for Shu'batu Ibn Amr (II)
-- Source: physical class register, First Term 2026/27 (Year 2 of programme)
-- S/N 3 (Anwar Muhammad Sani) is crossed out. S/N 25-30 are blank.
-- Teacher name not filled in register.

-- Ensure class exists
INSERT INTO public.classes (name, code) VALUES
  ('Shu''batu Ibn Amr (II)', 'SHU-IBN-AMR-II')
ON CONFLICT (code) DO NOTHING;

-- Insert students (all male, year_2, boarding default)
WITH cls AS (SELECT id FROM public.classes WHERE code = 'SHU-IBN-AMR-II')
INSERT INTO public.students (admission_no, full_name, gender, section, program_year, admission_date, class_id)
SELECT v.admission_no, v.full_name, 'male', 'boarding'::public.section_type, 'year_2'::public.program_year, '2025-09-01', cls.id
FROM cls, (VALUES
  ('AMQM/2025/080', 'Abdullahi Hamidu'),
  ('AMQM/2025/081', 'Aliyu Babangida Mijinyawa'),
  ('AMQM/2025/082', 'Jabir Ahmad'),
  ('AMQM/2025/083', 'Khalid Abubakar Yahaya'),
  ('AMQM/2025/084', 'Muh''d Nasir Karama'),
  ('AMQM/2025/085', 'Muhammad Abdulaziz'),
  ('AMQM/2025/086', 'Muhammad Abdullahi'),
  ('AMQM/2025/087', 'Muhammad Abdurrahman'),
  ('AMQM/2025/088', 'Muhammad Bello Marafa'),
  ('AMQM/2025/089', 'Muhammad Dahir Bala'),
  ('AMQM/2025/090', 'Muhammad Fawas Musa'),
  ('AMQM/2025/091', 'Muhammad Salisu Kabir'),
  ('AMQM/2025/092', 'Mujtaba Isa Muhammad'),
  ('AMQM/2025/093', 'Musa Mahmud'),
  ('AMQM/2025/094', 'Nabil Aliyu Jika'),
  ('AMQM/2025/095', 'Sadiq Muhammad Bello'),
  ('AMQM/2025/096', 'Sulaiman Musa'),
  ('AMQM/2025/097', 'Tahir Isa Bello'),
  ('AMQM/2025/098', 'Usman Dahir Muhammad'),
  ('AMQM/2025/099', 'Yakubu Adamu'),
  ('AMQM/2025/100', 'Zahradden Abubakar Bagudu'),
  ('AMQM/2025/101', 'Zakariyya Ismail'),
  ('AMQM/2025/102', 'Zayyad Muhammad')
) AS v(admission_no, full_name)
ON CONFLICT (admission_no) DO NOTHING;

NOTIFY pgrst, 'reload schema';
