import type { Metadata } from '@grpc/grpc-js';
import { type Observable, of } from 'rxjs';
import { WalletService } from './wallet.service';

type UnaryMock<Response> = jest.Mock<Observable<Response>, [unknown, Metadata]>;

describe('WalletService', () => {
  const token = '0123456789abcdef0123456789abcdef';

  it('scopes order lookup to the authenticated user and forwards internal credentials', async () => {
    const getPaymentOrder: UnaryMock<{ orderId: string; status: string }> =
      jest.fn((request, metadata) => {
        void request;
        void metadata;
        return of({ orderId: 'order-1', status: 'PENDING' });
      });
    const getCoinRate: UnaryMock<{ amountVnd: number; coinAmount: number }> =
      jest.fn((request, metadata) => {
        void request;
        void metadata;
        return of({ amountVnd: 1000, coinAmount: 1 });
      });
    const service = new WalletService(
      { getService: () => ({ getPaymentOrder, getCoinRate }) } as never,
      { getOrThrow: () => token } as never,
    );
    service.onModuleInit();
    await expect(
      service.getPaymentOrder('payer-1', 'DEPOSIT', 'order-1'),
    ).resolves.toHaveProperty('status', 'PENDING');
    expect(getPaymentOrder.mock.calls[0]?.[0]).toEqual({
      userId: 'payer-1',
      kind: 'DEPOSIT',
      reference: 'order-1',
    });
    await expect(service.getCoinRate('payer-1')).resolves.toEqual({
      amountVnd: 1000,
      coinAmount: 1,
    });
    for (const mock of [getPaymentOrder, getCoinRate]) {
      expect(mock.mock.calls[0][1].get('x-internal-token')).toEqual([token]);
    }
  });

  it('attaches the internal token to every Wallet gRPC request', async () => {
    let getBalanceMetadata: Metadata | undefined;
    let depositMetadata: Metadata | undefined;
    let debitMetadata: Metadata | undefined;
    const getBalance: UnaryMock<{
      coinBalance: number;
      frozenBalance: number;
    }> = jest.fn((request, metadata) => {
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
    const debitWallet: UnaryMock<{ transactionId: string; status: string }> =
      jest.fn((request, metadata) => {
        void request;
        debitMetadata = metadata;
        return of({ transactionId: 'TX-DEBIT-1', status: 'SUCCESS' });
      });
    const client = {
      getService: jest.fn(() => ({
        getBalance,
        createDepositOrder,
        debitWallet,
      })),
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
    await service.debit({
      userId: 'user-1',
      amount: 10,
      idempotencyKey: 'room-gift:request-1',
      description: 'Room gift rose x1 to user-2',
    });

    for (const metadata of [
      getBalanceMetadata,
      depositMetadata,
      debitMetadata,
    ]) {
      expect(metadata?.get('x-internal-token')).toEqual([token]);
    }
  });
});
