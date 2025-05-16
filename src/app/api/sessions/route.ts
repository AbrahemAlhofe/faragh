import { NextRequest, NextResponse } from 'next/server';
import '@ungap/with-resolvers';
import Redis from 'ioredis';
import { SESSION_STAGES, SessionProgress } from '@/lib/types';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

export async function POST(req: NextRequest) {

    const sessionId = Math.random().toString(36).substring(2, 15);

    const sessionProgress: SessionProgress<{}> = {
        stage: SESSION_STAGES.IDLE,
        cursor: 1,
        progress: 0,
        details: {}
    };

    redis.set(`${sessionId}/progress`, JSON.stringify(sessionProgress));

    return NextResponse.json({ sessionId });

}