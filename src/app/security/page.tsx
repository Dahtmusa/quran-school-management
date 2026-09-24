// The dedicated scanner view was consolidated into /attendance/scan so that
// admins, security, and principals share one interface. This page now just
// redirects there to keep old bookmarks and printed QR labels working.
import { redirect } from 'next/navigation';

export default function SecurityRedirect() {
  redirect('/attendance/scan');
}
