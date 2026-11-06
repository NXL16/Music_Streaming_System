import {
  BadRequestException,
  Body,
  Controller,
  Header,
  HttpException,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  CreateRoomTopUpDto,
  CreditRoomMusicCoinDto,
  DebitRoomMusicCoinDto,
  RoomCoinUserDto,
  RoomTopUpStatusDto,
} from './room-music-coin.dto';
import { ConfigService } from '@nestjs/config';
import { WalletService } from '../../wallet/wallet.service';
import { RoomClientAuthGuard } from './room-client-auth.guard';

const GIFT_PRICES: Record<string, number> = {
  rose: 10,
  heart: 20,
  crown: 50,
  diamond: 100,
  rocket: 200,
  trophy: 500,
};

@Controller('integrations/room/wallet')
@UseGuards(RoomClientAuthGuard)
export class RoomMusicCoinController {
  constructor(
    private readonly wallet: WalletService,
    private readonly config: ConfigService,
  ) {}

  @Post('topups/catalog')
  @Header('Cache-Control', 'private, no-store')
  topUpCatalog(@Body() body: RoomCoinUserDto) {
    return this.forwardTopUp('catalog', { userId: body.userId });
  }

  @Post('topups/create')
  @Header('Cache-Control', 'private, no-store')
  createTopUp(@Body() body: CreateRoomTopUpDto) {
    return this.forwardTopUp('create', {
      userId: body.userId,
      packageId: body.packageId,
      paymentMethod: body.paymentMethod,
    });
  }

  @Post('topups/status')
  @Header('Cache-Control', 'private, no-store')
  topUpStatus(@Body() body: RoomTopUpStatusDto) {
    return this.forwardTopUp('status', {
      userId: body.userId,
      orderId: body.orderId,
    });
  }

  private async forwardTopUp(
    operation: 'catalog' | 'create' | 'status',
    body: object,
  ): Promise<unknown> {
    try {
      const response = await this.postToWallet(
        `/internal/room/topups/${operation}`,
        body,
        14_000,
      );
      if (response.status === 400 || response.status === 404) {
        throw new HttpException(
          {
            code:
              response.status === 400
                ? 'MUSIC_TOPUP_INVALID'
                : 'MUSIC_TOPUP_NOT_FOUND',
          },
          response.status,
        );
      }
      if (!response.ok) throw new Error('Wallet top-up unavailable');
      return (await response.json()) as unknown;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException({ code: 'MUSIC_TOPUP_UNAVAILABLE' }, 503);
    }
  }

  @Post('gifts/credit')
  @Header('Cache-Control', 'private, no-store')
  async credit(@Body() body: CreditRoomMusicCoinDto): Promise<unknown> {
    try {
      const response = await this.postToWallet(
        '/internal/room/gifts/credit',
        body,
        12_000,
      );
      if (response.status === 400 || response.status === 409) {
        throw new HttpException(
          { code: 'MUSIC_COIN_SOURCE_INVALID' },
          response.status,
        );
      }
      if (!response.ok) throw new Error('Wallet credit unavailable');
      return (await response.json()) as unknown;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException({ code: 'MUSIC_COIN_UNAVAILABLE' }, 503);
    }
  }

  private async postToWallet(
    path: string,
    body: object,
    timeoutMs: number,
  ): Promise<Response> {
    const base = this.config.get<string>('WALLET_INTERNAL_HTTP_URL');
    const token = this.config.get<string>('INTERNAL_GRPC_TOKEN');
    if (!base || !token)
      throw new Error('Wallet integration is not configured');

    const target = new URL(path, base);
    if (
      !['http:', 'https:'].includes(target.protocol) ||
      target.username ||
      target.password
    ) {
      throw new Error('Invalid Wallet URL');
    }
    return fetch(target, {
      method: 'POST',
      redirect: 'error',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-token': token,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  }

  @Post('balance')
  @Header('Cache-Control', 'private, no-store')
  async balance(@Body() body: RoomCoinUserDto) {
    const balance = await this.wallet.getBalance(body.userId);
    return {
      success: true,
      code: 'MUSIC_COIN_BALANCE',
      data: {
        coinBalance: balance.coinBalance,
        frozenBalance: balance.frozenBalance,
      },
    };
  }

  @Post('gifts/debit')
  @Header('Cache-Control', 'private, no-store')
  async debit(@Body() body: DebitRoomMusicCoinDto) {
    const price = GIFT_PRICES[body.giftType];
    if (
      !price ||
      !Number.isInteger(body.quantity) ||
      body.quantity < 1 ||
      body.quantity > 100
    ) {
      throw new BadRequestException({ code: 'MUSIC_COIN_GIFT_INVALID' });
    }
    if (body.userId === body.toUserId) {
      throw new BadRequestException({ code: 'MUSIC_COIN_SELF_GIFT_FORBIDDEN' });
    }

    const amount = price * body.quantity;
    try {
      const debit = await this.wallet.debit({
        userId: body.userId,
        amount,
        idempotencyKey: `room-gift:${body.requestId}`,
        description: `Room gift ${body.giftType} x${body.quantity} to ${body.toUserId}`,
      });
      const balance = await this.wallet.getBalance(body.userId);
      return {
        success: true,
        code: 'MUSIC_COIN_GIFT_DEBIT',
        data: {
          transactionId: debit.transactionId,
          spentCoins: amount,
          balance: {
            coinBalance: balance.coinBalance,
            frozenBalance: balance.frozenBalance,
          },
        },
      };
    } catch (error) {
      if (
        error instanceof Error &&
        /insufficient balance/i.test(error.message)
      ) {
        throw new HttpException(
          {
            code: 'MUSIC_COIN_INSUFFICIENT',
            requiredCoins: amount,
          },
          HttpStatus.PAYMENT_REQUIRED,
        );
      }
      throw error;
    }
  }
}
