import { NextRequest, NextResponse } from 'next/server';
import '@ungap/with-resolvers';
import { SESSION_STAGES, SessionProgress } from '@/lib/types';
import { getRedis } from '@/lib/redis';

export async function POST(req: NextRequest) {

    const sessionId = Math.random().toString(36).substring(2, 15);

    const sessionProgress: SessionProgress<{}> = {
        stage: SESSION_STAGES.IDLE,
        cursor: 1,
        progress: 0,
        details: {}
    };

    getRedis().set(`${sessionId}/progress`, JSON.stringify(sessionProgress));

    return NextResponse.json({ sessionId });

}