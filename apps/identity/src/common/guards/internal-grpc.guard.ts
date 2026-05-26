import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Metadata, status } from '@grpc/grpc-js';
import { RpcException } from '@nestjs/microservices';
import { timingSafeEqual } from 'crypto';

@Injectable()
export class InternalGrpcGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const metadata =
      context.switchToRpc().getContext<Metadata>() ??
      context.getArgByIndex<Metadata>(1);

    const expected = this.configService.getOrThrow<string>('INTERNAL_GRPC_TOKEN');
    const provided = metadata?.get('x-internal-token')?.[0];

    if (typeof provided !== 'string' || !safeEqual(provided, expected)) {
      throw new RpcException({
        code: status.UNAUTHENTICATED,
        message: 'Unauthorized internal request',
      });
    }

    return true;
  }
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  return left.length === right.length && timingSafeEqual(left, right);
}