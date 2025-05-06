import Redis from "ioredis";
import { NextRequest, NextResponse } from "next/server";

const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");

export async function GET(req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;

  if (!sessionId) {
    return new NextResponse(JSON.stringify({ error: "No sessionId provided" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const progress = await redis.get(`${sessionId}/progress`);

  if (!progress) {
    return new NextResponse(JSON.stringify({ error: "Session not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new NextResponse(progress);
}