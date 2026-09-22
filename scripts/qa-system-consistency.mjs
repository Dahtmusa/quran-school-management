import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const checks=[];
const expect=(ok,msg)=>checks.push([ok,msg]);

const nav=read('src/lib/nav-links.ts');
const topbar=read('src/components/Topbar.tsx');
const calendar=read('src/app/calendar/page.tsx');
const screening=read('src/app/admissions/screening/[token]/page.tsx');
const migration=read('supabase/migrations/20260920150000_continuous_journey_admissions_screening.sql');
const homepage=read('src/components/PublicHomepageSchool.tsx');
const orbit=read('src/components/OrbitalPeopleSection.tsx');
const leadership=read('src/components/LeadershipSection.tsx');
const teaching=read('src/components/TeachingStaffSection.tsx');
const cms=read('src/app/cms/page.tsx');

expect(!topbar.includes('/program-setup'), 'Topbar has no obsolete Program & Terms link');
expect(topbar.includes("import { roleLinks } from '@/lib/nav-links'"), 'Topbar uses the shared navigation source');
expect(nav.includes("['/calendar', 'School Calendar'"), 'Admin navigation includes School Calendar');
expect(!calendar.match(/two[- ]year/i), 'Calendar has no fixed two-year wording');
expect(screening.includes('min-h-11'), 'Virtual meeting controls are touch-friendly');
expect(screening.includes('facingMode'), 'Virtual meeting requests a mobile-friendly front camera');
expect(screening.includes('pendingIce'), 'Virtual meeting queues early ICE candidates');
expect(screening.includes('NEXT_PUBLIC_WEBRTC_TURN_URL'), 'Virtual meeting supports optional TURN configuration');
expect(migration.includes('screening_token'), 'Remote screening uses unique tokens');
expect(migration.includes("lower(trim(coalesce(a.state,'')))='adamawa'"), 'Screening mode is based on Adamawa residency');
expect(homepage.includes('<LeadershipSection leaders={leadership}'), 'Homepage uses the data-driven leadership component');
expect(homepage.includes('<TeachingStaffSection teachers={teacherList}'), 'Homepage uses the data-driven teaching component');
expect(!homepage.includes('leadership.slice(0, 3).map'), 'Homepage has no legacy static leadership card grid');
expect(!homepage.includes('teacherList.slice(0, 4).map'), 'Homepage has no legacy static teacher card grid');
expect(orbit.includes('requestAnimationFrame'), 'Orbital people uses performant requestAnimationFrame animation');
expect(orbit.includes('prefers-reduced-motion'), 'Orbital people respects reduced motion');
expect(orbit.includes('IntersectionObserver'), 'Orbital people pauses work outside the viewport');
expect(orbit.includes('View Profile'), 'Orbital people preserves profile navigation');
expect(orbit.includes('count <= 1'), 'Orbital people handles a single person without navigation');
expect(orbit.includes('count >= 9'), 'Orbital people adapts sizing for larger teams');
expect(orbit.includes('width < 390'), 'Orbital people has a dedicated small-phone layout');
expect(orbit.includes('ResizeObserver'), 'Orbital people recalculates layout on resize');
expect(leadership.includes("href: '/leadership/' + leader.id"), 'Leadership keeps existing profile routing');
expect(teaching.includes("href: '/teachers/' + teacher.id"), 'Teachers keep existing profile routing');
expect(homepage.includes('item.image_url || item.image'), 'Homepage testimonials support parent photos');
expect(homepage.includes('item.name ||'), 'Homepage testimonials support parent names');
expect(cms.includes("key==='testimonials'"), 'CMS has a dedicated parent testimonial editor');
expect(cms.includes('Upload photo'), 'CMS can upload parent testimonial photos');
expect(cms.includes('Parent name'), 'CMS can edit parent testimonial names');

const failed=checks.filter(x=>!x[0]);
if(failed.length){
 console.error('System consistency QA FAILED');
 for(const [,msg] of failed)console.error(' - '+msg);
 process.exit(1);
}
console.log(`System consistency QA PASSED: ${checks.length} checks.`);
