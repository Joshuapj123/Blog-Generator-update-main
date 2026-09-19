import { NextRequest, NextResponse } from 'next/server';

// Routes that don't require authentication
const PUBLIC_PATHS = ['/login', '/favicon.ico'];

// Prefixes that are always allowed through
const PUBLIC_PREFIXES = ['/_next', '/api'];

function isSafeRelativePath(p: string): boolean {
  return typeof p === 'string' && p.startsWith('/') && !p.startsWith('//') && !p.startsWith('/\\');
}

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
    // Default root / to /engine as the active ACUTE entry point
    const targetPath = pathname === '/' ? '/engine' : pathname;
    const safeDestination = isSafeRelativePath(targetPath) ? targetPath : '/engine';
    loginUrl.searchParams.set('from', safeDestination);

    // Preserve UTM attribution and referral query parameters
    request.nextUrl.searchParams.forEach((val, key) => {
      const lower = key.toLowerCase();
      if (lower.startsWith('utm_') || lower === 'ref' || lower === 'source') {
        loginUrl.searchParams.set(key, val);
      }
    });

    return NextResponse.redirect(loginUrl);
  }

  // If authenticated user visits root /, forward directly to /engine preserving UTMs
  if (pathname === '/') {
    const engineUrl = new URL('/engine', request.url);
    request.nextUrl.searchParams.forEach((val, key) => {
      engineUrl.searchParams.set(key, val);
    });
    return NextResponse.redirect(engineUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Run middleware on every route except static files
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
