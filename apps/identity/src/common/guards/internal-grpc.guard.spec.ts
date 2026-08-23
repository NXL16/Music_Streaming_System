import type { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RpcException } from '@nestjs/microservices';
import { Test, type TestingModule } from '@nestjs/testing';
import { Metadata, status } from '@grpc/grpc-js';
import { InternalGrpcGuard } from './internal-grpc.guard';

const INTERNAL_TOKEN = 'identity-internal-token-for-guard-test';

describe('InternalGrpcGuard', () => {
  let guard: InternalGrpcGuard;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InternalGrpcGuard,
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn().mockReturnValue(INTERNAL_TOKEN),
          },
        },
      ],
    }).compile();

    guard = module.get(InternalGrpcGuard);
  });

  it.each([
    ['missing token', new Metadata()],
    ['wrong token', metadataWithToken('wrong-token')],
  ])('rejects a gRPC request with a %s', (_caseName, metadata) => {
    const error = expectRpcException(() =>
      guard.canActivate(createRpcContext(metadata)),
    );

    expect(error.getError()).toEqual({
      code: status.UNAUTHENTICATED,
      message: 'Unauthorized internal request',
    });
  });

  it('accepts a gRPC request with the valid internal token', () => {
    expect(
      guard.canActivate(createRpcContext(metadataWithToken(INTERNAL_TOKEN))),
    ).toBe(true);
  });
});

function createRpcContext(metadata: Metadata): ExecutionContext {
  return {
    switchToRpc: () => ({
      getContext: () => metadata,
    }),
    getArgByIndex: (index: number) => (index === 1 ? metadata : undefined),
  } as unknown as ExecutionContext;
}

function metadataWithToken(token: string): Metadata {
  const metadata = new Metadata();
  metadata.set('x-internal-token', token);
  return metadata;
}

function expectRpcException(action: () => unknown): RpcException {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(RpcException);
    return error as RpcException;
  }

  throw new Error('Expected InternalGrpcGuard to reject the gRPC request');
}
