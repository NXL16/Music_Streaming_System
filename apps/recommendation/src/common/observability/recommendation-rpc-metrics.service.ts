import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';

const METRIC_FLUSH_INTERVAL_MS = 60_000;
const SLOW_RPC_P95_MS = 1_000;
const MAX_SAMPLES_PER_OPERATION = 2_048;

type OperationMetrics = {
  calls: number;
  errors: number;
  totalDurationMs: number;
  durationsMs: number[];
};

/**
 * Emits bounded, structured RPC metrics without introducing a process-local
 * dependency on a particular monitoring vendor. Ship these logs to the
 * platform's collector and alert on `recommendation_slo_breach`.
 */
@Injectable()
export class RecommendationRpcMetricsService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(RecommendationRpcMetricsService.name);
  private readonly operations = new Map<string, OperationMetrics>();
  private flushTimer?: NodeJS.Timeout;

  onModuleInit() {
    this.flushTimer = setInterval(() => this.flush(), METRIC_FLUSH_INTERVAL_MS);
    this.flushTimer.unref();
  }

  onModuleDestroy() {
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.flush();
  }

  record(operation: string, durationMs: number, failed: boolean) {
    const current = this.operations.get(operation) ?? {
      calls: 0,
      errors: 0,
      totalDurationMs: 0,
      durationsMs: [],
    };
    current.calls += 1;
    current.errors += failed ? 1 : 0;
    current.totalDurationMs += durationMs;
    if (current.durationsMs.length < MAX_SAMPLES_PER_OPERATION) {
      current.durationsMs.push(durationMs);
    }
    this.operations.set(operation, current);
  }

  private flush() {
    for (const [operation, metric] of this.operations) {
      const p95Ms = this.percentile(metric.durationsMs, 0.95);
      const payload = {
        event: 'recommendation_rpc_metrics',
        operation,
        calls: metric.calls,
        errors: metric.errors,
        avgMs: Math.round(metric.totalDurationMs / Math.max(1, metric.calls)),
        p95Ms,
      };
      this.logger.log(JSON.stringify(payload));

      if (metric.errors > 0 || p95Ms >= SLOW_RPC_P95_MS) {
        this.logger.warn(
          JSON.stringify({ ...payload, event: 'recommendation_slo_breach' }),
        );
      }
    }
    this.operations.clear();
  }

  private percentile(values: number[], percentile: number): number {
    if (!values.length) return 0;
    const ordered = [...values].sort((left, right) => left - right);
    return ordered[Math.min(ordered.length - 1, Math.floor(ordered.length * percentile))];
  }
}
