import { NextRequest, NextResponse } from 'next/server';
import '@ungap/with-resolvers';
import Redis from 'ioredis';
import { PutBlobResult } from '@vercel/blob';
import { SESSION_STAGES } from '@/lib/types';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

export async function POST(req: NextRequest) {

    const body = await req.json() as PutBlobResult
    const sessionId = Math.random().toString(36).substring(2, 15);

    redis.set(`${sessionId}/progress`, JSON.stringify({ stage: SESSION_STAGES.READY, cursor: 1, progress: 0, details: body }));

    return NextResponse.json({ sessionId });

}