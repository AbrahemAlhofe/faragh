import { NextRequest, NextResponse } from 'next/server';
import '@ungap/with-resolvers';
import Redis from 'ioredis';
import { SESSION_STAGES, SessionProgress } from '@/lib/types';

if (!process.env.REDIS_HOST || !process.env.REDIS_PORT) {
    throw new Error('Missing Redis configuration in environment variables');
}

console.log(process.env.REDIS_HOST, process.env.REDIS_PORT, process.env.REDIS_USERNAME, process.env.REDIS_PASSWORD);

const redis = new Redis(Number(process.env.REDIS_PORT), process.env.REDIS_HOST, {
    username: process.env.REDIS_USERNAME,
    password: process.env.REDIS_PASSWORD,
});

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