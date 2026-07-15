import { firstValueFrom, Observable, timeout } from 'rxjs';

const GRPC_TIMEOUT_MS = 10_000;

export function grpcFirstValueFrom<T>(
  obs: Observable<T>,
  timeoutMs = GRPC_TIMEOUT_MS,
): Promise<T> {
  return firstValueFrom(obs.pipe(timeout(timeoutMs)));
}
