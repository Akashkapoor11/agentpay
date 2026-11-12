import { NextResponse } from 'next/server';

function allowedOrigins() {
  return String(process.env.FRONTEND_ORIGIN || 'http://localhost:3000')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

export function proxy(request) {
  const origin = request.headers.get('origin') || '';
  const allowed = allowedOrigins();
  if (origin && !allowed.includes('*') && !allowed.includes(origin)) {
    return NextResponse.json({ error: 'Origin is not allowed.' }, { status: 403, headers: { Vary: 'Origin' } });
  }

  const response = request.method === 'OPTIONS'
    ? new NextResponse(null, { status: 204 })
    : NextResponse.next();
  if (origin && allowed.includes('*')) {
    response.headers.set('Access-Control-Allow-Origin', '*');
  } else if (origin) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Vary', 'Origin');
  }
  response.headers.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  response.headers.set('Access-Control-Max-Age', '600');
  return response;
}

export const config = { matcher: ['/api/:path*'] };
