# rate-limiter-gateway

A lightweight API gateway middleware in TypeScript that enforces sliding-window rate limiting using Redis sorted sets (`ZSET`). Built to run as a standalone proxy layer in front of Express services to protect downstream endpoints from burst traffic and repeated polling.

---

## The Problem It Solves

Most simple rate limiters use a fixed-window counter (e.g., reset every minute on the minute). The flaw with that approach is edge-bursting: a client can fire 5 requests at 00:59 and another 5 at 01:01, pushing 10 requests through within 2 seconds without ever getting blocked.

This project implements a **sliding window** anchored to the exact millisecond of each incoming request, ensuring that a limit of 5 requests per 30 seconds is strictly enforced across *any* rolling 30-second window.

---

## How the Redis Sliding Window Works

Each rate-limited client gets an isolated key in Redis (`ratelimit:<ip>`) holding a Sorted Set. 

When a request arrives, four Redis commands run inside a single atomic pipeline:

1. `ZREMRANGEBYSCORE key 0 (now - 30s)`  
   Drops all timestamps older than the active 30-second window.
2. `ZADD key now "<now>:<random>"`  
   Records the current request timestamp with a unique suffix (so multiple requests in the same millisecond don't overwrite each other).
3. `ZCARD key`  
   Counts how many valid requests remain in the set.
4. `EXPIRE key 30`  
   Refreshes the key TTL so inactive IPs automatically clear out of memory.

If `ZCARD` returns a count higher than the allowed quota (5), the request is rejected with `429 Too Many Requests`.
