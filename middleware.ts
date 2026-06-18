import { updateSession } from '@/lib/supabase/middleware';
import { type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, icons, manifest, sw.js (PWA assets)
     * - api routes that don't need auth
     */
    '/((?!_next/static|_next/image|favicon\\.ico|icons/.*|manifest\\.json|sw\\.js).*)',
  ],
};
