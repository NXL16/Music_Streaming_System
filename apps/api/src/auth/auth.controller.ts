import {
  Body,
  Controller,
  Post,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import type { Request } from 'express';
import { JwtUser } from '@musical/shared-types';

@Controller('auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('signup')
  async signup(@Body() signupDto: SignupDto) {
    const data = await this.authService.signUp(signupDto);
    return {
      success: true,
      code: 'AUTH_SIGNUP_SUCCESS',
      data,
      message: 'Đăng ký thành công',
      timestamp: new Date().toISOString(), 
    };
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: LoginDto) {
    const data = await this.authService.login(loginDto);
    return {
      success: true,
      code: 'AUTH_LOGIN_SUCCESS',
      data,
      message: 'Đăng nhập thành công',
      timestamp: new Date().toISOString(),
    };
  }

  @Post('refresh')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async refresh(@Body('refreshToken') refreshToken: string) {
    if (!refreshToken || typeof refreshToken !== 'string') {
      throw new BadRequestException({
        success: false,
        code: 'AUTH_REFRESH_TOKEN_REQUIRED',
        message: 'Refresh token là bắt buộc',
      });
    }

    const data = await this.authService.refreshToken(refreshToken);
    return {
      success: true,
      code: 'AUTH_REFRESH_SUCCESS',
      data,
      message: 'Làm mới token thành công',
      timestamp: new Date().toISOString(),
    };
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: Request) {
    const user = req.user as JwtUser;

    await this.authService.logout(user.userId, user.deviceId);

    return {
      success: true,
      code: 'AUTH_LOGOUT_SUCCESS',
      message: 'Đăng xuất thành công',
      timestamp: new Date().toISOString(),
    };
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  async logoutAll(@Req() req: Request) {
    const user = req.user as JwtUser;

    await this.authService.logoutAll(user.userId);

    return {
      success: true,
      code: 'AUTH_LOGOUT_ALL_SUCCESS',
      message: 'Đăng xuất tất cả thiết bị thành công',
      timestamp: new Date().toISOString(),
    };
  }
}
