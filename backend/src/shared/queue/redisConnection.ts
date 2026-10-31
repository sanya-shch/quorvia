import "dotenv/config";
import { Redis } from "ioredis";
import { getRedisUrl } from "../../config/env.js";

export const redisConnection = new Redis(getRedisUrl(), {
  maxRetriesPerRequest: null,
});
