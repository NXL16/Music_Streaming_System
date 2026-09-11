import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { JwtUser } from '@musical/shared-types';
import type { AuthResponse } from '@musical/shared-proto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';
import { VerifyTwoFactorLoginDto } from './dto/two-factor.dto';
import { getSessionMetadata } from './session-metadata';

/**
 * Authentication boundary for the Artist Portal only.
 *
 * Its refresh cookie uses another name and path, so a listener's session can
 * never be silently reused by artists. A pending application may authenticate
 * here only to see its approval state; access to studio APIs remains ARTIST-only.
 */
@Controller('artist/auth')
export class ArtistAuthController {
  private static readonly REFRESH_COOKIE_NAME = 'artist_refresh_token';

  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  async signup(@Body() signupDto: SignupDto) {
    const data = await this.authService.signUpArtist(signupDto);
    return this.formatResponse(
      data,
      'ARTIST_APPLICATION_CREATED',
      'Yêu cầu đăng ký Artist đã được gửi để quản trị viên duyệt',
    );
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() loginDto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.authService.loginArtist(
      loginDto,
      getSessionMetadata(req),
    );

    if (data.twoFactorRequired) {
      return this.formatResponse(
        this.withoutRefreshToken(data),
        'ARTIST_2FA_REQUIRED',
        'Vui lòng nhập mã xác thực 2FA để hoàn tất đăng nhập Artist',
      );
    }

    this.setRefreshTokenCookie(res, data);
    return this.formatResponse(
      this.withoutRefreshToken(data),
      'ARTIST_LOGIN_SUCCESS',
      'Đăng nhập Artist thành công',
    );
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = this.readRefreshToken(req);
    if (!refreshToken) {
      throw new UnauthorizedException({
        code: 'ARTIST_REFRESH_TOKEN_MISSING',
        message: 'Phiên Artist không tồn tại',
      });
    }

    const data = await this.authService.refreshToken({ refreshToken });
    this.ensureArtistAccount(data);
    this.setRefreshTokenCookie(res, data);
    return this.formatResponse(
      this.withoutRefreshToken(data),
      'ARTIST_REFRESH_SUCCESS',
      'Làm mới phiên Artist thành công',
    );
  }

  @Post('2fa/login')
  @HttpCode(HttpStatus.OK)
  async verifyTwoFactorLogin(
    @Body() dto: VerifyTwoFactorLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.authService.verifyArtistTwoFactorLogin(
      {
        challengeId: dto.challengeId,
        code: dto.code,
        recoveryCode: dto.recoveryCode,
      },
      getSessionMetadata(req),
    );
    this.setRefreshTokenCookie(res, data);
    return this.formatResponse(
      this.withoutRefreshToken(data),
      'ARTIST_2FA_LOGIN_SUCCESS',
      'Xác thực Artist thành công',
    );
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const user = req.user as JwtUser;
    this.ensureArtistRole(user.role);

    await this.authService.logout({
      userId: user.userId,
      deviceId: user.deviceId,
      accessJti: user.jti,
      accessExp: user.exp,
    });
    this.clearRefreshTokenCookie(res);
    return this.formatResponse(
      null,
      'ARTIST_LOGOUT_SUCCESS',
      'Đã đăng xuất Artist',
    );
  }

  private ensureArtistAccount(data: AuthResponse) {
    if (!data.user) {
      throw new UnauthorizedException({
        code: 'ARTIST_ACCOUNT_REQUIRED',
        message: 'Phiên Artist không hợp lệ',
      });
    }
    this.ensureArtistRole(data.user.role);
  }

  private ensureArtistRole(role: string) {
    if (role === 'ARTIST' || role === 'ARTIST_PENDING') {
      return;
    }

    throw new UnauthorizedException({
      code: 'ARTIST_ACCOUNT_REQUIRED',
      message: 'Tài khoản này không phải tài khoản Artist',
    });
  }

  private formatResponse(data: unknown, code: string, message: string) {
    return {
      success: true,
      code,
      data: data ?? {},
      message,
      timestamp: new Date().toISOString(),
    };
  }

  private withoutRefreshToken(data: AuthResponse) {
    return {
      accessToken: data.accessToken,
      deviceId: data.deviceId,
      expiresIn: data.expiresIn,
      user: data.user,
      twoFactorRequired: data.twoFactorRequired,
      twoFactorChallengeId: data.twoFactorChallengeId,
    };
  }

  private setRefreshTokenCookie(res: Response, data: AuthResponse) {
    if (!data.refreshToken || data.twoFactorRequired) {
      return;
    }

    res.cookie(ArtistAuthController.REFRESH_COOKIE_NAME, data.refreshToken, {
      httpOnly: true,
      secure: this.refreshCookieSecure(),
      sameSite: 'lax',
      path: this.refreshCookiePath(),
      maxAge: this.refreshCookieMaxAgeMs(),
    });
  }

  private clearRefreshTokenCookie(res: Response) {
    res.clearCookie(ArtistAuthController.REFRESH_COOKIE_NAME, {
      httpOnly: true,
      secure: this.refreshCookieSecure(),
      sameSite: 'lax',
      path: this.refreshCookiePath(),
    });
  }

  private readRefreshToken(req: Request) {
    const cookies = req.cookies as unknown as
      Record<string, string | undefined> | undefined;
    return cookies?.[ArtistAuthController.REFRESH_COOKIE_NAME];
  }

  private refreshCookiePath() {
    const prefix = this.configService.get<string>('API_PREFIX') ?? '';
    const normalizedPrefix = prefix.replace(/^\/+|\/+$/g, '');
    return normalizedPrefix
      ? `/${normalizedPrefix}/artist/auth`
      : '/artist/auth';
  }

  private refreshCookieSecure() {
    return (
      this.configService.get<string>('AUTH_REFRESH_COOKIE_SECURE') === 'true'
    );
  }

  private refreshCookieMaxAgeMs() {
    const maxAgeDays = Number(
      this.configService.getOrThrow<string>('AUTH_REFRESH_COOKIE_MAX_AGE_DAYS'),
    );
    return maxAgeDays * 24 * 60 * 60 * 1000;
  }
}
