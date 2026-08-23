import type { Metadata } from '@grpc/grpc-js';
import { NEVER, TimeoutError, type Observable, of } from 'rxjs';
import { WalletClientService } from './wallet-client.service';

type UnaryMock<Response> = jest.Mock<Observable<Response>, [unknown, Metadata]>;

describe('WalletClientService', () => {
  it('attaches the internal token when provisioning a wallet', async () => {
    const token = '0123456789abcdef0123456789abcdef';
    let receivedMetadata: Metadata | undefined;
    const createWallet: UnaryMock<{ status: string }> = jest.fn(
      (request, metadata) => {
        void request;
        receivedMetadata = metadata;
        return of({ status: 'SUCCESS' });
      },
    );
    const client = { getService: jest.fn(() => ({ createWallet })) };
    const config = { getOrThrow: jest.fn(() => token) };
    const service = new WalletClientService(client as never, config as never);
    service.onModuleInit();

    await service.createWalletForUser('user-1');

    expect(createWallet).toHaveBeenCalledTimes(1);
    expect(receivedMetadata?.get('x-internal-token')).toEqual([token]);
  });

  it('fails a stalled Wallet RPC before the caller lease expires', async () => {
    const createWallet: UnaryMock<{ status: string }> = jest.fn(
      (request, metadata) => {
        void request;
        void metadata;
        return NEVER;
      },
    );
    const client = { getService: jest.fn(() => ({ createWallet })) };
    const config = { getOrThrow: jest.fn(() => 'token') };
    const service = new WalletClientService(client as never, config as never);
    service.onModuleInit();

    await expect(service.createWalletForUser('user-1', 1)).rejects.toBeInstanceOf(
      TimeoutError,
    );
  });
});
