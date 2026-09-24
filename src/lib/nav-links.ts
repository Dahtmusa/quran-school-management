// Single source of truth for role-based dashboard navigation, shared by the
// desktop Sidebar and the mobile Topbar drawer.
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
  ['/fees/bulk-documents', 'Invoices & Receipts', '▤'],
  ['/calendar', 'School Calendar', '◷'],
  ['/reports', 'Report Cards', '▤'],
  ['/alumni', 'Alumni', '★'],
  ['/cms', 'Website CMS', '✦'],
  ['/admin/users', 'User Management', '⚙'],
];

export const teacherLinks: NavLink[] = [
  ['/teacher', 'My Dashboard', '⌂'],
  ['/teacher/students', 'My Students', '◉'],
  ['/teacher/attendance', 'Attendance', '✓'],
];
export const parentLinks: NavLink[] = [['/parent', 'My Children', '⌂'], ['/reports', 'Reports', '▤']];
export const financeLinks: NavLink[] = [['/fees', 'Finance & Fees', '₦'], ['/fees/bulk-documents', 'Invoices & Receipts', '▤']];
export const admissionsLinks: NavLink[] = [['/admissions/manage', 'Admissions', '▣'], ['/students', 'Students', '◉']];
export const securityLinks: NavLink[] = [['/attendance/scan', 'Scanner', '✓']];

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
