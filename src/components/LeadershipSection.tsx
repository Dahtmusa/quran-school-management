'use client';

import OrbitalPeopleSection, { type OrbitPerson } from '@/components/OrbitalPeopleSection';

export type Leader = {
  id: string;
  full_name: string;
  role_title?: string | null;
  category?: string | null;
  photo_url?: string | null;
  brief_bio?: string | null;
  full_profile?: string | null;
  qualifications?: string | null;
  experience?: string | null;
  subjects?: string | null;
};

export function LeadershipSection({
  leaders,
  shortName = 'AMQM',
}: {
  leaders: Leader[];
  shortName?: string;
}) {
  const people: OrbitPerson[] = leaders.map((leader) => ({
    id: leader.id,
    full_name: leader.full_name,
    role: leader.role_title || 'School Leadership',
    photo_url: leader.photo_url || null,
    href: '/leadership/' + leader.id,
  }));

  return (
    <OrbitalPeopleSection
      eyebrow="Leadership & Management"
      title="The people who lead AMQM."
      description="Experienced educators and visionary leaders dedicated to excellence in Qur’anic education."
      people={people}
      shortName={shortName}
    />
  );
}
