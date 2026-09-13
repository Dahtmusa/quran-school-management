import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/proxy';

// Next.js 16 proxy entry point. Export both names for compatibility with
// the proxy convention while keeping the existing session/auth logic intact.
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export default proxy;

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
