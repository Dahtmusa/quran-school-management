'use client';

import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import { loadCMSSections, loadCMSSettings, loadPublicTeam, loadPublicTeachers } from '@/lib/cms-live-store';
import { LeadershipSection } from '@/components/LeadershipSection';
import { TeachingStaffSection } from '@/components/TeachingStaffSection';

export default function RestoredPeoplePortal() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [leaders, setLeaders] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [values, setValues] = useState<any[]>([]);
  const [shortName, setShortName] = useState('AMQM');

  useEffect(() => {
    let active = true;
    Promise.all([loadPublicTeam(), loadPublicTeachers(), loadCMSSections(), loadCMSSettings()]).then(([team, teacherRows, sections, settings]) => {
      if (!active) return;
      setLeaders(team || []);
      setTeachers(teacherRows || []);
      const valuesSection = (sections || []).find((s: any) => s.section_key === 'values');
      setValues(valuesSection?.content?.items || []);
      setShortName(settings?.short_name?.value || 'AMQM');
    }).catch(() => {});

    const findAndPrepare = () => {
      const headings = Array.from(document.querySelectorAll('h2'));
      const heading = headings.find((h) => h.textContent?.trim().toLowerCase() === 'teachers & leadership'.toLowerCase());
      const oldSection = heading?.closest('section') as HTMLElement | null;
      if (!oldSection) return false;

      oldSection.style.display = 'none';
      let next = oldSection.nextElementSibling as HTMLElement | null;
      if (!next || next.getAttribute('data-restored-people-host') !== 'true') {
        next = document.createElement('div');
        next.setAttribute('data-restored-people-host', 'true');
        oldSection.insertAdjacentElement('afterend', next);
      }
      if (active) setHost(next);
      return true;
    };

    if (findAndPrepare()) return () => { active = false; };
    const observer = new MutationObserver(() => {
      if (findAndPrepare()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => { active = false; observer.disconnect(); };
  }, []);

  if (!host || (!leaders.length && !teachers.length)) return null;

  return createPortal(
    <>
      <LeadershipSection leaders={leaders} shortName={shortName} />
      <TeachingStaffSection teachers={teachers} values={values} />
    </>,
    host,
  );
}
