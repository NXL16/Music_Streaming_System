import { Body, Controller, Post, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  async signup(@Body() registerDto: RegisterDto) {
    const data = await this.authService.register(registerDto);
    return {
      success: true,
      code: 'AUTH_SIGNUP_SUCCESS',
      data,
      message: 'Đăng ký thành công',
      timestamp: new Date().toISOString(),
    };
  }

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
}
