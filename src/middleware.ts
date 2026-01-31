import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Redirect /U/... to /u/... (case-insensitive path)
  if (pathname.startsWith('/U/')) {
    const newPathname = '/u/' + pathname.slice(3);
    const url = request.nextUrl.clone();
    url.pathname = newPathname;
    return NextResponse.redirect(url, 301);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/U/:path*'],
};
