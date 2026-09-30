import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Logger,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import type { JwtUser } from '@musical/shared-types';
import { StrictJwtAuthGuard } from '../common/guards/strict-jwt-auth.guard';
import { WalletService } from './wallet.service';
import { CreateDepositDto } from './dto/create-deposit.dto';
import { VerifyNFBankAccountDto } from './dto/verify-nfbank-account.dto';
import { CreateNFBankWithdrawalDto } from './dto/create-nfbank-withdrawal.dto';
import { SetWithdrawPinDto } from './dto/set-withdraw-pin.dto';
import { LinkBankAccountDto } from './dto/link-bank-account.dto';

@Controller('wallet')
export class WalletController {
  private readonly logger = new Logger(WalletController.name);

  constructor(
    private readonly walletService: WalletService,
    private readonly configService: ConfigService,
  ) {}

  @Get('balance')
  @UseGuards(StrictJwtAuthGuard)
  async getBalance(@Req() req: Request) {
    const user = req.user as JwtUser;
    return this.walletService.getBalance(user.userId);
  }

  @Get('withdraw/status')
  @UseGuards(StrictJwtAuthGuard)
  async getWithdrawStatus(@Req() req: Request) {
    const user = req.user as JwtUser;
    return this.walletService.getWithdrawStatus(user.userId);
  }

  @Post('withdraw/pin')
  @UseGuards(StrictJwtAuthGuard)
  async setWithdrawPin(@Req() req: Request, @Body() body: SetWithdrawPinDto) {
    const user = req.user as JwtUser;
    return this.walletService.setWithdrawPin(user.userId, body.pin);
  }

  @Post('bank-accounts/link')
  @UseGuards(StrictJwtAuthGuard)
  async linkBankAccount(@Req() req: Request, @Body() body: LinkBankAccountDto) {
    const user = req.user as JwtUser;
    return this.walletService.linkBankAccount(
      user.userId,
      body.accountNumber,
      body.pin,
      body.bankCode,
    );
  }

  @Post('deposit')
  @UseGuards(StrictJwtAuthGuard)
  async createDeposit(@Req() req: Request, @Body() body: CreateDepositDto) {
    const user = req.user as JwtUser;

    return this.walletService.createDepositOrder({
      userId: user.userId,
      amountVnd: body.amountVnd,
      paymentMethod: body.paymentMethod,
    });
  }

  @Post('withdraw/nfbank/verify-account')
  @UseGuards(StrictJwtAuthGuard)
  async verifyNFBankAccount(@Body() body: VerifyNFBankAccountDto) {
    return this.walletService.verifyNFBankAccount(body.accountNumber);
  }

  @Post('withdraw/nfbank')
  @UseGuards(StrictJwtAuthGuard)
  async createNFBankWithdrawal(
    @Req() req: Request,
    @Body() body: CreateNFBankWithdrawalDto,
  ) {
    const user = req.user as JwtUser;
    return this.walletService.createNFBankWithdrawal({
      userId: user.userId,
      accountNumber: body.accountNumber ?? '',
      bankAccountId: body.bankAccountId ?? '',
      pin: body.pin,
      amountVnd: body.amountVnd,
      idempotencyKey: body.idempotencyKey,
    });
  }

  @Post('webhook/momo')
  async handleMomoWebhook(
    @Body() payload: Record<string, unknown>,
    @Res() res: Response,
  ) {
    return this.forwardWebhook('momo', payload, res);
  }

  @Post('webhook/nfbank')
  async handleNFBankWebhook(
    @Body() payload: Record<string, unknown>,
    @Res() res: Response,
  ) {
    return this.forwardWebhook('nfbank', payload, res);
  }

  private async forwardWebhook(
    provider: 'momo' | 'nfbank',
    payload: Record<string, unknown>,
    res: Response,
  ) {
    const walletHttpUrl =
      this.configService.getOrThrow<string>('WALLET_HTTP_URL');

    try {
      const walletResponse = await fetch(
        `${walletHttpUrl}/v1/wallet/webhook/${provider}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );

      if (walletResponse.status === Number(HttpStatus.NO_CONTENT)) {
        return res.status(HttpStatus.NO_CONTENT).send();
      }

      const text = await walletResponse.text();

      if (!text) {
        return res.status(walletResponse.status).send();
      }

      try {
        return res.status(walletResponse.status).json(JSON.parse(text));
      } catch {
        return res.status(walletResponse.status).send(text);
      }
    } catch (error) {
      this.logger.error(
        `Cannot forward ${provider} webhook to wallet service`,
        error,
      );

      return res.status(HttpStatus.BAD_GATEWAY).json({
        code: 'WALLET_SERVICE_UNAVAILABLE',
        message: 'API Gateway không thể kết nối Wallet Service',
      });
    }
  }
}
