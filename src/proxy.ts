import { NextRequest, NextResponse } from 'next/server';

// Routes that don't require authentication
const PUBLIC_PATHS = ['/login', '/favicon.ico'];

// Prefixes that are always allowed through
const PUBLIC_PREFIXES = ['/_next', '/api'];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths and prefixes
  if (
    PUBLIC_PATHS.some((p) => pathname === p) ||
    PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))
  ) {
    return NextResponse.next();
  }

  // Check for session cookie set by AuthProvider after sign-in
  const session = request.cookies.get('__session')?.value;

  if (!session) {
    const loginUrl = new URL('/login', request.url);
    // Preserve the original destination so we can redirect after login
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Run middleware on every route except static files
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
