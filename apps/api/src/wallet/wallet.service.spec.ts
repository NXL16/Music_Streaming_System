import type { Metadata } from '@grpc/grpc-js';
import { type Observable, of } from 'rxjs';
import { WalletService } from './wallet.service';

type UnaryMock<Response> = jest.Mock<Observable<Response>, [unknown, Metadata]>;

describe('WalletService', () => {
  const token = '0123456789abcdef0123456789abcdef';

  it('attaches the internal token to every Wallet gRPC request', async () => {
    let getBalanceMetadata: Metadata | undefined;
    let depositMetadata: Metadata | undefined;
    const getBalance: UnaryMock<{ coinBalance: number; frozenBalance: number }> =
      jest.fn((request, metadata) => {
        void request;
        getBalanceMetadata = metadata;
        return of({ coinBalance: 10, frozenBalance: 2 });
      });
    const createDepositOrder: UnaryMock<{ orderId: string }> = jest.fn(
      (request, metadata) => {
        void request;
        depositMetadata = metadata;
        return of({ orderId: 'order-1' });
      },
    );
    const client = {
      getService: jest.fn(() => ({ getBalance, createDepositOrder })),
    };
    const config = { getOrThrow: jest.fn(() => token) };
    const service = new WalletService(client as never, config as never);
    service.onModuleInit();

    await service.getBalance('user-1');
    await service.createDepositOrder({
      userId: 'user-1',
      amountVnd: 10_000,
      paymentMethod: 'MOMO',
    });

    for (const metadata of [getBalanceMetadata, depositMetadata]) {
      expect(metadata?.get('x-internal-token')).toEqual([token]);
    }
  });
});
