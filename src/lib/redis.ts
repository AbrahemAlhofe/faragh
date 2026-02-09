import Redis from "ioredis";

let redisInstance: Redis | null = null;

export function getRedis(): Redis {
  if (!redisInstance) {
    redisInstance = new Redis(parseInt(process.env.REDIS_PORT || "6379"), process.env.REDIS_HOST || "localhost", {
      password: process.env.REDIS_PASSWORD,
      username: process.env.REDIS_USERNAME,
    });
  }
  return redisInstance;
}