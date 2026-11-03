import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { slidingWindowLimiter, redis } from './rateLimiter';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Set quota: max 5 requests per 30 seconds
const apiLimiter = slidingWindowLimiter({
  windowSizeInSeconds: 30,
  maxRequests: 5,
});

// Health check endpoint
app.get('/health', async (_req: Request, res: Response) => {
  try {
    const ping = await redis.ping();
    res.json({
      service: 'Distributed Rate-Limiting Gateway',
      status: 'UP',
      redis: ping,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ status: 'DOWN', error: err.message });
  }
});

// Rate-limited test resource
app.get('/api/resource', apiLimiter, (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: 'Protected resource payload delivered.',
    message: 'Request passed within rate threshold.',
  });
});

// Root informational endpoint
app.get('/', (_req: Request, res: Response) => {
  res.json({
    name: 'Distributed Rate-Limiting Gateway API',
    endpoints: {
      health: 'GET /health',
      testRateLimit: 'GET /api/resource (Max 5 requests per 30s)',
    },
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});