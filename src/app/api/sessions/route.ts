import { NextRequest, NextResponse } from 'next/server';
import '@ungap/with-resolvers';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

export async function GET(req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {

    const sessionId = Math.random().toString(36).substring(2, 15);

    redis.set(`${sessionId}/progress`, JSON.stringify({ stage: "IDLE", cursor: 0 }));

    return NextResponse.json({ sessionId });

}