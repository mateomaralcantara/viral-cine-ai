import { NextRequest, NextResponse } from 'next/server';

export function proxy(request: NextRequest) {
  const accessKey = process.env.STUDIO_ACCESS_KEY;
  if (!accessKey) return NextResponse.next();

  const authorization = request.headers.get('authorization');
  if (authorization?.startsWith('Basic ')) {
    const decoded = atob(authorization.slice(6));
    const [, password = ''] = decoded.split(':');
    if (password === accessKey) return NextResponse.next();
  }

  return new NextResponse('Acceso privado de ViralCine Studio', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="ViralCine Studio"' }
  });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
};
