import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {

    console.log(`[INFO] Build Time : ${process.env.buildTime}`);

    return NextResponse.next();

}

export const config = {
  matcher: ['/:path*']
}