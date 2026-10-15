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
import { DebitRoomMusicCoinDto, RoomCoinUserDto } from './room-music-coin.dto';
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
  constructor(private readonly wallet: WalletService) {}

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
    if (!price || !Number.isInteger(body.quantity) || body.quantity < 1 || body.quantity > 100) {
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
      if (error instanceof Error && /insufficient balance/i.test(error.message)) {
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

