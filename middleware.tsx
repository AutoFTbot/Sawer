import { NextRequest, NextResponse } from 'next/server';

export const config = {
  matcher: '/dash/:path*', 
};

export default async function middleware(permintaan: NextRequest) {
  return tanganiAutentikasi(permintaan);
}

function tanganiAutentikasi(permintaan: NextRequest) {
  const autentikasiBasic = permintaan.headers.get('authorization');
  const normalizeEnv = (value?: string | null): string => {
    if (!value) return '';
    let out = value.trim();
    const idx = out.indexOf('//');
    if (idx !== -1) out = out.slice(0, idx).trim();
    out = out.replace(/^['"`]+/, '').replace(/['"`]+$/, '').trim();
    return out;
  }
  const PENGGUNA_ADMIN = normalizeEnv(process.env.ADMIN_USER);
  const KATA_SANDI_ADMIN = normalizeEnv(process.env.ADMIN_PASS);

  if (autentikasiBasic) {
    const nilaiAutentikasi = autentikasiBasic.split(' ')[1];
    const [pengguna, kataSandi] = atob(nilaiAutentikasi).split(':');
    
    if (pengguna === PENGGUNA_ADMIN && kataSandi === KATA_SANDI_ADMIN) {
      return NextResponse.next(); 
    }
  }
  const url = permintaan.nextUrl;
  // Balas 401 langsung agar browser memunculkan Basic Auth prompt
  return new NextResponse('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Dashboard", charset="UTF-8"' }
  });
}
