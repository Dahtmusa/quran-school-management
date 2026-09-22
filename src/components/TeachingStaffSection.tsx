'use client';

import OrbitalPeopleSection, { type OrbitPerson } from '@/components/OrbitalPeopleSection';

export type Teacher = {
  id: string;
  full_name: string;
  job_title?: string | null;
  department?: string | null;
  avatar_url?: string | null;
  bio?: string | null;
  qualifications?: string | null;
  experience?: string | null;
  subjects?: string | null;
};

export type ValuesItem = { label?: string; [key: string]: unknown };

export function TeachingStaffSection({
  teachers,
}: {
  teachers: Teacher[];
  values?: ValuesItem[];
}) {
  const people: OrbitPerson[] = teachers.map((teacher) => ({
    id: teacher.id,
    full_name: teacher.full_name,
    role: teacher.job_title || teacher.department || 'Qur’an Teacher',
    photo_url: teacher.avatar_url || null,
    href: '/teachers/' + teacher.id,
  }));

  return (
    <OrbitalPeopleSection
      eyebrow="Teaching Staff"
      title="The teachers who shape tomorrow."
      description="Qualified teachers bringing Qur’anic knowledge, dedication and care to every lesson."
      people={people}
    />
  );
}
