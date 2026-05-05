import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { JwtUser } from '@musical/shared-types';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { Request } from 'express';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  async signup(@Body() signupDto: SignupDto) {
    const data = await this.authService.signUp(signupDto);
    return this.formatResponse(
      data,
      'AUTH_SIGNUP_SUCCESS',
      'Đăng ký thành công',
    );
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: LoginDto) {
    const data = await this.authService.login(loginDto);
    return this.formatResponse(
      data,
      'AUTH_LOGIN_SUCCESS',
      'Đăng nhập thành công',
    );
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body('refreshToken') refreshToken: string) {
    const data = await this.authService.refreshToken({ refreshToken });
    return this.formatResponse(
      data,
      'AUTH_REFRESH_SUCCESS',
      'Làm mới token thành công',
    );
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: Request) {
    const user = req.user as JwtUser;

    await this.authService.logout({
      userId: user.userId,
      deviceId: user.deviceId,
    });

    return this.formatResponse(
      null,
      'AUTH_LOGOUT_SUCCESS',
      'Đăng xuất thành công',
    );
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logoutAll(@Req() req: Request) {
    const user = req.user as JwtUser;

    await this.authService.logoutAll({
      userId: user.userId,
    });

    return this.formatResponse(
      null,
      'AUTH_LOGOUT_ALL_SUCCESS',
      'Đăng xuất tất cả thiết bị thành công',
    );
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
}
