import Redis from "ioredis";

let redisInstance: Redis | null = null;

export function getRedis(): Redis {
  // For production, we have a username and password, but for development we might not, so we conditionally include them in the Redis constructor
  if (!redisInstance) {
    redisInstance = new Redis(parseInt(process.env.REDIS_URL || "6379"), process.env.REDIS_HOST || "localhost", {
        username: process.env.REDIS_USERNAME || undefined,  
        password: process.env.REDIS_PASSWORD || undefined
    });
  }
  return redisInstance;
}