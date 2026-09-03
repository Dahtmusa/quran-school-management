-- Migration 043: Import students for Shu'batu Ibn Katheer and Shu'batu Imam Hamza
-- Source: physical class registers, First Term 2026/27 (Year 2 of programme)
-- Crossed-out entries (S/N 24, 27, 33 from Ibn Katheer) are excluded.
-- Section defaults to 'boarding'; admin can edit individual students to correct.

-- 1. Ensure the two classes exist
INSERT INTO public.classes (name, code) VALUES
  ('Shu''batu Ibn Katheer', 'SHU-IBN-KATHEER'),
  ('Shu''batu Imam Hamza',  'SHU-IMAM-HAMZA')
ON CONFLICT (code) DO NOTHING;

-- 2. Insert students for Shu'batu Ibn Katheer (boys)
WITH cls AS (SELECT id FROM public.classes WHERE code = 'SHU-IBN-KATHEER')
INSERT INTO public.students (admission_no, full_name, gender, section, program_year, admission_date, class_id)
SELECT v.admission_no, v.full_name, 'male', 'boarding'::public.section_type, 'year_2'::public.program_year, '2025-09-01', cls.id
FROM cls, (VALUES
  ('AMQM/2025/001', 'Abbas Lawan Bello'),
  ('AMQM/2025/002', 'Abdul-Majid Adam'),
  ('AMQM/2025/003', 'Abdul-Majid Hammadu'),
  ('AMQM/2025/004', 'Abdul-Mumin Ibrahim'),
  ('AMQM/2025/005', 'Abdul-Wasiu Auwal'),
  ('AMQM/2025/006', 'Adamu Aliyu Sabirin'),
  ('AMQM/2025/007', 'Adamu Bashir'),
  ('AMQM/2025/008', 'Ahmad Aliyu Babagadi'),
  ('AMQM/2025/009', 'Ahmad Ismail Ilyasu'),
  ('AMQM/2025/010', 'Al-Amin Ahmad'),
  ('AMQM/2025/011', 'Aliyu Ahmad Aliyu'),
  ('AMQM/2025/012', 'Aliyu Muhammad Bawuro'),
  ('AMQM/2025/013', 'Anwar Garba Gadzama'),
  ('AMQM/2025/014', 'Asim Muhammad Bashir'),
  ('AMQM/2025/015', 'Hamidu Yahaya Hammadu'),
  ('AMQM/2025/016', 'Huzaifa M. Buhari'),
  ('AMQM/2025/017', 'Ibrahim Lawan Bello'),
  ('AMQM/2025/018', 'Muhammad Faisal Musa'),
  ('AMQM/2025/019', 'Muhammad Umar Muhammad'),
  ('AMQM/2025/020', 'Musa Umar Sulaiman'),
  ('AMQM/2025/021', 'Rayyan Dahiru'),
  ('AMQM/2025/022', 'Salisu Ismail'),
  ('AMQM/2025/023', 'Sulaiman Abdullahi'),
  ('AMQM/2025/024', 'Sulaiman Ahmad Aliyu'),
  ('AMQM/2025/025', 'Umar Rabiu'),
  ('AMQM/2025/026', 'Yahaya Ali'),
  ('AMQM/2025/027', 'Yasir Aliyu Abubakar'),
  ('AMQM/2025/028', 'Adamu Abdullahi Kandara'),
  ('AMQM/2025/029', 'Mustapha Musa'),
  ('AMQM/2025/030', 'Abubakar Sadiq Musa'),
  ('AMQM/2025/031', 'Muhammad Junaidu Ibrahim'),
  ('AMQM/2025/032', 'Dahiru Lawan Bello')
) AS v(admission_no, full_name)
ON CONFLICT (admission_no) DO NOTHING;

-- 3. Insert students for Shu'batu Imam Hamza (girls)
WITH cls AS (SELECT id FROM public.classes WHERE code = 'SHU-IMAM-HAMZA')
INSERT INTO public.students (admission_no, full_name, gender, section, program_year, admission_date, class_id)
SELECT v.admission_no, v.full_name, 'female', 'boarding'::public.section_type, 'year_2'::public.program_year, '2025-09-01', cls.id
FROM cls, (VALUES
  ('AMQM/2025/033', 'Aisha Abdul-Qadir Ayuba'),
  ('AMQM/2025/034', 'Bilkisu Bello Marafa'),
  ('AMQM/2025/035', 'Fatima Abdul-Wahid'),
  ('AMQM/2025/036', 'Fatima Muhammad Abubakar'),
  ('AMQM/2025/037', 'Fatima Sulyman Abdullahi'),
  ('AMQM/2025/038', 'Habiba Abdullahi'),
  ('AMQM/2025/039', 'Hamida Yahya'),
  ('AMQM/2025/040', 'Hauwa Aliyu Namtari'),
  ('AMQM/2025/041', 'Juwairiya Musa Abdullah'),
  ('AMQM/2025/042', 'Khadija Adam Abdullahi'),
  ('AMQM/2025/043', 'Maryam Musa Umar'),
  ('AMQM/2025/044', 'Sa''adatu Ahmad Aliyu'),
  ('AMQM/2025/045', 'Salma Abdul-Wahab'),
  ('AMQM/2025/046', 'Ummul-Kulchum Ahmad Sa''ad'),
  ('AMQM/2025/047', 'Zainab Isa Hussaini'),
  ('AMQM/2025/048', 'Amuda Halilu Muhammad'),
  ('AMQM/2025/049', 'Mariya Halilu Muhammad'),
  ('AMQM/2025/050', 'Ashtfagi Babanguda Myintabba'),
  ('AMQM/2025/051', 'Hauwa Umar Bamanga'),
  ('AMQM/2025/052', 'Ummu-Salma Suleiman')
) AS v(admission_no, full_name)
ON CONFLICT (admission_no) DO NOTHING;

NOTIFY pgrst, 'reload schema';
