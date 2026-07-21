import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { finalize, tap } from 'rxjs';
import { RecommendationRpcMetricsService } from './recommendation-rpc-metrics.service';

@Injectable()
export class RecommendationRpcMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: RecommendationRpcMetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    const startedAt = performance.now();
    const operation = context.getHandler().name || 'unknown';
    let failed = false;

    return next.handle().pipe(
      tap({ error: () => (failed = true) }),
      finalize(() => {
        this.metrics.record(operation, performance.now() - startedAt, failed);
      }),
    );
  }
}
