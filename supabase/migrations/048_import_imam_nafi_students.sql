-- Migration 048: Import students for Shu'batu Imam Nafi
-- Source: physical class register, First Term 2026/27 (Year 2 of programme)
-- S/N 29-30 blank. S/N 9 (Aisha Abubakar Usman) is female; all others male.
-- Teacher: Abdurrahman Muhammad (partially visible).

INSERT INTO public.classes (name, code) VALUES
  ('Shu''batu Imam Nafi', 'SHU-IMAM-NAFI')
ON CONFLICT (code) DO NOTHING;

WITH cls AS (SELECT id FROM public.classes WHERE code = 'SHU-IMAM-NAFI')
INSERT INTO public.students (admission_no, full_name, gender, section, program_year, admission_date, class_id)
SELECT v.admission_no, v.full_name, v.gender, 'boarding'::public.section_type, 'year_2'::public.program_year, '2025-09-01', cls.id
FROM cls, (VALUES
  ('AMQM/2025/149', 'Abdullahi Ilyasu Mu''azu',          'male'),
  ('AMQM/2025/150', 'Abdurrahman Umar Sulaiman',          'male'),
  ('AMQM/2025/151', 'Abubakar Aliyu',                     'male'),
  ('AMQM/2025/152', 'Abubakar Isa Muhammad',              'male'),
  ('AMQM/2025/153', 'Abubakar Muhammad',                  'male'),
  ('AMQM/2025/154', 'Ahmad Adamu',                        'male'),
  ('AMQM/2025/155', 'Ahmad Haruna Abdullahi',             'male'),
  ('AMQM/2025/156', 'Ahmad Umar Usman',                   'male'),
  ('AMQM/2025/157', 'Aisha Abubakar Usman',               'female'),
  ('AMQM/2025/158', 'Bello Abubakar',                     'male'),
  ('AMQM/2025/159', 'Hussaini Umar Sulaiman',             'male'),
  ('AMQM/2025/160', 'Ibrahim Isa Muhammad',               'male'),
  ('AMQM/2025/161', 'Imrana Hussaini',                    'male'),
  ('AMQM/2025/162', 'Ja''afar Muh''d Mu''azu',           'male'),
  ('AMQM/2025/163', 'Lukman Musa Adamu',                  'male'),
  ('AMQM/2025/164', 'Muh''d Annur Yunusa',                'male'),
  ('AMQM/2025/165', 'Muh''d Yahya Abdullahi',             'male'),
  ('AMQM/2025/166', 'Muhammad Al-Amin Yusuf',             'male'),
  ('AMQM/2025/167', 'Muhammad Aminu Usman',               'male'),
  ('AMQM/2025/168', 'Muhammad Ibrahim Babulli',           'male'),
  ('AMQM/2025/169', 'Muhammad Tahir Zubair',              'male'),
  ('AMQM/2025/170', 'Mustapha Ahmad',                     'male'),
  ('AMQM/2025/171', 'Salisu Ibrahim',                     'male'),
  ('AMQM/2025/172', 'Sani Abdulhamid',                    'male'),
  ('AMQM/2025/173', 'Ukasha Ibrahim',                     'male'),
  ('AMQM/2025/174', 'Bilal Muhammad Abdulkarim',          'male'),
  ('AMQM/2025/175', 'Yusuf Suleiman',                     'male'),
  ('AMQM/2025/176', 'Abdurrahman Mukhter Abdul',          'male')
) AS v(admission_no, full_name, gender)
ON CONFLICT (admission_no) DO NOTHING;

NOTIFY pgrst, 'reload schema';
