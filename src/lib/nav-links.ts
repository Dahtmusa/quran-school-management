// Single source of truth for role-based dashboard navigation, shared by the
// desktop Sidebar and the mobile Topbar drawer. These previously kept two
// separate, hand-maintained copies of each link list, which had drifted:
// desktop was missing "Program & Terms" (/program-setup), mobile was missing
// "Staff" (/staff) and "User Management" (/admin/users), and the security
// role's mobile link pointed at /attendance — a route the security role
// isn't allowed to view per src/lib/supabase/proxy.ts's roleRoutes, so it
// silently redirected security staff back to their own dashboard. Keeping
// one list means desktop and mobile can no longer disagree about what a
// role can reach.
export type NavLink = [href: string, label: string, icon: string];

export const adminLinks: NavLink[] = [
  ['/admin', 'Dashboard', '⌂'],
  ['/students', 'Students', '◉'],
  ['/classes', 'Classes & Teachers', '▦'],
  ['/staff', 'Staff', '♧'],
  ['/admissions/manage', 'Admissions', '▣'],
  ['/attendance', 'Attendance', '✓'],
  ['/evaluations', 'Quran Evaluations', '☾'],
  ['/fees', 'Finance & Fees', '₦'],
  ['/program-setup', 'Program & Terms', '❖'],
  ['/calendar', 'School Calendar', '◷'],
  ['/reports', 'Report Cards', '▤'],
  ['/alumni', 'Alumni', '★'],
  ['/cms', 'Website CMS', '✦'],
  ['/admin/users', 'User Management', '⚙'],
];

export const teacherLinks: NavLink[] = [['/teacher', 'My Dashboard', '⌂']];
export const parentLinks: NavLink[] = [['/parent', 'My Children', '⌂'], ['/reports', 'Reports', '▤']];
export const financeLinks: NavLink[] = [['/fees', 'Finance & Fees', '₦']];
export const admissionsLinks: NavLink[] = [['/admissions/manage', 'Admissions', '▣'], ['/students', 'Students', '◉']];
// /security is the only route the security role is allowed to view
// (see roleRoutes in src/lib/supabase/proxy.ts) — do not point this at
// /attendance, which redirects security staff straight back out.
export const securityLinks: NavLink[] = [['/security', 'Scanner', '✓']];

export function roleLinks(role: string): NavLink[] {
  switch (role) {
    case 'teacher': return teacherLinks;
    case 'parent': return parentLinks;
    case 'finance': return financeLinks;
    case 'admissions': return admissionsLinks;
    case 'security': return securityLinks;
    default: return adminLinks;
  }
}
