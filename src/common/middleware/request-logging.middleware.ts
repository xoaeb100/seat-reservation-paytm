import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const requestId = req.header('X-Request-ID')?.trim() || randomUUID();

    const start = process.hrtime.bigint();

    res.setHeader('X-Request-ID', requestId);

    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;

      console.log(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'info',
          request_id: requestId,
          method: req.method,
          path: req.originalUrl,
          status: res.statusCode,
          duration_ms: Math.round(durationMs),
        }),
      );
    });

    next();
  }
}
