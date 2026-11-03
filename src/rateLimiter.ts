import { Request, Response, NextFunction } from 'express';
import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

export const redis = new Redis(process.env.REDIS_URL || '', {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
});

interface RateLimitConfig {
  windowSizeInSeconds: number;
  maxRequests: number;
}

export const slidingWindowLimiter = (config: RateLimitConfig) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const forwarded = req.headers['x-forwarded-for'];
      const clientIp = typeof forwarded === 'string' 
        ? forwarded.split(',')[0].trim() 
        : req.socket.remoteAddress || 'unknown-client';
        
      const key = `ratelimit:${clientIp}`;
      const now = Date.now();
      const clearBefore = now - config.windowSizeInSeconds * 1000;

      // Atomic pipeline execution in Redis
      const pipeline = redis.pipeline();
      pipeline.zremrangebyscore(key, 0, clearBefore);
      pipeline.zadd(key, now, `${now}:${Math.random().toString(36).substring(2, 7)}`);
      pipeline.zcard(key);
      pipeline.expire(key, config.windowSizeInSeconds);

      const results = await pipeline.exec();
      if (!results) {
        return next();
      }

      // results[2][1] corresponds to the zcard count
      const totalRequests = results[2][1] as number;
      const remaining = Math.max(0, config.maxRequests - totalRequests);

      res.setHeader('X-RateLimit-Limit', config.maxRequests);
      res.setHeader('X-RateLimit-Remaining', remaining);
      res.setHeader('X-RateLimit-Reset', Math.ceil((now + config.windowSizeInSeconds * 1000) / 1000));

      if (totalRequests > config.maxRequests) {
        res.setHeader('Retry-After', config.windowSizeInSeconds);
        res.status(429).json({
          status: 429,
          error: 'Too Many Requests',
          message: `Rate limit of ${config.maxRequests} requests per ${config.windowSizeInSeconds}s exceeded. Try again later.`,
        });
        return;
      }

      next();
    } catch (error) {
      console.error('Rate limiter internal error, failing open:', error);
      next();
    }
  };
};