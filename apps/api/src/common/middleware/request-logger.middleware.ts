import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction): void {
    const start = Date.now();

    res.on('finish', () => {
      const duration = Date.now() - start;
      const { method } = req;
      const { statusCode } = res;
      const requestTarget = redactRequestTarget(req.originalUrl);

      if (requestTarget.includes('/health')) return;

      this.logger.log(`${method} ${requestTarget} ${statusCode} ${duration}ms`);
    });

    next();
  }
}

function redactRequestTarget(originalUrl: string): string {
  const queryIndex = originalUrl.indexOf('?');
  const path =
    queryIndex === -1 ? originalUrl : originalUrl.slice(0, queryIndex);
  const redactedPath = path.replace(
    /^(\/(?:v\d+\/)?integrations\/room\/media\/)[^/?#]+/,
    '$1[REDACTED]',
  );

  return queryIndex === -1 ? redactedPath : `${redactedPath}?[REDACTED]`;
}
