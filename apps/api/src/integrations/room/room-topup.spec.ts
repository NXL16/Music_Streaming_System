import { ConfigService } from '@nestjs/config';
import { validate } from 'class-validator';
import { RoomMusicCoinController } from './room-music-coin.controller';
import { CreateRoomTopUpDto } from './room-music-coin.dto';

jest.mock('../../wallet/wallet.service', () => ({ WalletService: class {} }));

describe('Room wallet gateway', () => {
  const fetchMock = jest.fn<
    ReturnType<typeof fetch>,
    Parameters<typeof fetch>
  >();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  const controller = (configured = true) => {
    const config: Record<string, string> = {
      WALLET_INTERNAL_HTTP_URL: 'http://wallet:8082',
      INTERNAL_GRPC_TOKEN: 'internal-test-token',
    };
    return new RoomMusicCoinController(
      {} as never,
      {
        get: (key: string) => (configured ? config[key] : undefined),
      } as unknown as ConfigService,
    );
  };

  const mockWalletSuccess = (body: unknown) => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  };

  it('forwards only supported top-up fields and keeps the token server-side', async () => {
    mockWalletSuccess({
      success: true,
      code: 'MUSIC_TOPUP_ORDER',
      data: { status: 'PENDING' },
    });
    await controller().createTopUp({
      userId: '11111111-1111-4111-8111-111111111111',
      packageId: '10000',
      paymentMethod: 'MOMO',
      coins: 99999,
    } as CreateRoomTopUpDto);

    const [target, init] = fetchMock.mock.calls[0] ?? [];
    if (!(target instanceof URL)) throw new Error('expected URL target');
    expect(target.href).toBe('http://wallet:8082/internal/room/topups/create');
    expect(init?.redirect).toBe('error');
    expect(new Headers(init?.headers).get('x-internal-token')).toBe(
      'internal-test-token',
    );
    if (typeof init?.body !== 'string') throw new Error('expected JSON body');
    expect(JSON.parse(init.body) as unknown).toEqual({
      userId: '11111111-1111-4111-8111-111111111111',
      packageId: '10000',
      paymentMethod: 'MOMO',
    });
  });

  it('does not retry an ambiguous create failure', async () => {
    fetchMock.mockRejectedValue(new Error('timeout'));
    await expect(
      controller().createTopUp({
        userId: 'id',
        packageId: '10000',
        paymentMethod: 'NFBANK',
      }),
    ).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not call Wallet when private configuration is missing', async () => {
    await expect(
      controller(false).topUpCatalog({ userId: 'id' }),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects unsupported package values through the DTO', async () => {
    const dto = Object.assign(new CreateRoomTopUpDto(), {
      userId: '11111111-1111-4111-8111-111111111111',
      packageId: '1',
      paymentMethod: 'CASH',
    });
    expect((await validate(dto)).map((error) => error.property).sort()).toEqual(
      ['packageId', 'paymentMethod'],
    );
  });

  it('forwards gift credit only to the private Wallet endpoint', async () => {
    mockWalletSuccess({ success: true, code: 'MUSIC_COIN_GIFT_CREDIT' });
    await controller().credit({
      userId: '11111111-1111-4111-8111-111111111111',
      fromUserId: '22222222-2222-4222-8222-222222222222',
      requestId: 'room-credit:aaaaaaaaaaaaaaaaaaaaaaaa',
      debitTransactionId: 'TX-DEBIT-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      giftType: 'rose',
      quantity: 1,
    });

    const [target, init] = fetchMock.mock.calls[0] ?? [];
    if (!(target instanceof URL)) throw new Error('expected URL target');
    expect(target.href).toBe('http://wallet:8082/internal/room/gifts/credit');
    expect(new Headers(init?.headers).get('x-internal-token')).toBe(
      'internal-test-token',
    );
  });
});
