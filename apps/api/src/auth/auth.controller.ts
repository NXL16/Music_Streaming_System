import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { JwtUser } from '@musical/shared-types';
import type { AuthResponse } from '@musical/shared-proto';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { StrictJwtAuthGuard } from '../common/guards/strict-jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { SetUserStatusDto } from './dto/set-user-status.dto';
import {
  RequestPasswordResetDto,
  ResetPasswordDto,
} from './dto/password-reset.dto';
import { LogoutDeviceDto } from './dto/logout-device.dto';
import { VerifyEmailDto } from './dto/email-verification.dto';
import {
  ConfirmTwoFactorSetupDto,
  DisableTwoFactorDto,
  RegenerateTwoFactorRecoveryCodesDto,
  VerifyTwoFactorLoginDto,
} from './dto/two-factor.dto';
import { GoogleLoginDto } from './dto/google-login.dto';
import { SetUserRoleDto } from './dto/set-user-role.dto';

@Controller('auth')
export class AuthController {
  private static readonly REFRESH_COOKIE_NAME = 'refresh_token';

  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Post('signup')
  async signup(
    @Body() signupDto: SignupDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.authService.signUp(signupDto);
    this.setRefreshTokenCookie(res, data);
    return this.formatResponse(
      this.withoutRefreshToken(data),
      'AUTH_SIGNUP_SUCCESS',
      'Đăng ký thành công',
    );
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.authService.login(loginDto);

    if (data.twoFactorRequired) {
      return this.formatResponse(
        this.withoutRefreshToken(data),
        'AUTH_2FA_REQUIRED',
        'Vui lòng nhập mã xác thực 2FA để hoàn tất đăng nhập',
      );
    }

    this.setRefreshTokenCookie(res, data);

    return this.formatResponse(
      this.withoutRefreshToken(data),
      'AUTH_LOGIN_SUCCESS',
      'Đăng nhập thành công',
    );
  }

  @Post('google/login')
  @HttpCode(HttpStatus.OK)
  async loginWithGoogle(
    @Body() dto: GoogleLoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.authService.loginWithGoogle({
      idToken: dto.idToken ?? '',
      authorizationCode: dto.authorizationCode ?? dto.code,
      deviceId: dto.deviceId,
    });

    this.setRefreshTokenCookie(res, data);

    return this.formatResponse(
      this.withoutRefreshToken(data),
      'AUTH_GOOGLE_LOGIN_SUCCESS',
      'Đăng nhập Google thành công',
    );
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cookies = req.cookies as unknown as
      | Record<string, string | undefined>
      | undefined;
    const refreshToken = cookies?.[AuthController.REFRESH_COOKIE_NAME];

    if (!refreshToken) {
      throw new UnauthorizedException({
        code: 'REFRESH_TOKEN_MISSING',
        message: 'Refresh token không tồn tại',
      });
    }

    const data = await this.authService.refreshToken({ refreshToken });
    this.setRefreshTokenCookie(res, data);
    return this.formatResponse(
      this.withoutRefreshToken(data),
      'AUTH_REFRESH_SUCCESS',
      'Làm mới token thành công',
    );
  }

  @Get('me')
  @UseGuards(StrictJwtAuthGuard)
  async me(@Req() req: Request) {
    const user = req.user as JwtUser;
    const data = await this.authService.getProfile({ userId: user.userId });

    return this.formatResponse(
      data,
      'AUTH_PROFILE_SUCCESS',
      'Lấy thông tin tài khoản thành công',
    );
  }

  @Post('2fa/login')
  @HttpCode(HttpStatus.OK)
  async verifyTwoFactorLogin(
    @Body() dto: VerifyTwoFactorLoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.authService.verifyTwoFactorLogin({
      challengeId: dto.challengeId,
      code: dto.code ?? dto.credential,
      recoveryCode: dto.recoveryCode,
    });

    this.setRefreshTokenCookie(res, data);

    return this.formatResponse(
      this.withoutRefreshToken(data),
      'AUTH_2FA_LOGIN_SUCCESS',
      'Xác thực 2FA thành công',
    );
  }

  @Patch('me')
  @UseGuards(StrictJwtAuthGuard)
  async updateProfile(
    @Req() req: Request,
    @Body() updateProfileDto: UpdateProfileDto,
  ) {
    const user = req.user as JwtUser;
    const data = await this.authService.updateProfile({
      userId: user.userId,
      displayName: updateProfileDto.displayName,
      avatar: updateProfileDto.avatar,
      bio: updateProfileDto.bio,
    });

    return this.formatResponse(
      data,
      'AUTH_UPDATE_PROFILE_SUCCESS',
      'Cập nhật thông tin tài khoản thành công',
    );
  }

  @Post('change-password')
  @UseGuards(StrictJwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @Req() req: Request,
    @Body() changePasswordDto: ChangePasswordDto,
  ) {
    const user = req.user as JwtUser;
    await this.authService.changePassword({
      userId: user.userId,
      currentPassword: changePasswordDto.currentPassword,
      newPassword: changePasswordDto.newPassword,
    });

    return this.formatResponse(
      null,
      'AUTH_CHANGE_PASSWORD_SUCCESS',
      'Đổi mật khẩu thành công, vui lòng đăng nhập lại',
    );
  }

  @Post('password/forgot')
  @HttpCode(HttpStatus.OK)
  async requestPasswordReset(@Body() dto: RequestPasswordResetDto) {
    const data = await this.authService.requestPasswordReset({
      email: dto.email,
    });

    return this.formatResponse(
      null,
      'AUTH_PASSWORD_RESET_REQUESTED',
      data.message,
    );
  }

  @Post('password/reset')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword({
      token: dto.token,
      newPassword: dto.newPassword,
    });

    return this.formatResponse(
      null,
      'AUTH_PASSWORD_RESET_SUCCESS',
      'Đặt lại mật khẩu thành công',
    );
  }

  @Post('email/request-verification')
  @UseGuards(StrictJwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async requestEmailVerification(@Req() req: Request) {
    const user = req.user as JwtUser;
    const data = await this.authService.requestEmailVerification({
      userId: user.userId,
    });

    return this.formatResponse(
      null,
      'AUTH_EMAIL_VERIFICATION_REQUESTED',
      data.message,
    );
  }

  @Post('email/verify')
  @HttpCode(HttpStatus.OK)
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    const data = await this.authService.verifyEmail({ token: dto.token });

    return this.formatResponse(
      data,
      'AUTH_EMAIL_VERIFY_SUCCESS',
      'Xác thực email thành công',
    );
  }

  @Post('2fa/setup')
  @UseGuards(StrictJwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async beginTwoFactorSetup(@Req() req: Request) {
    const user = req.user as JwtUser;
    const data = await this.authService.beginTwoFactorSetup({
      userId: user.userId,
    });

    return this.formatResponse(
      data,
      'AUTH_2FA_SETUP_STARTED',
      'Bắt đầu thiết lập 2FA thành công',
    );
  }

  @Post('2fa/confirm')
  @UseGuards(StrictJwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async confirmTwoFactorSetup(
    @Req() req: Request,
    @Body() dto: ConfirmTwoFactorSetupDto,
  ) {
    const user = req.user as JwtUser;
    const data = await this.authService.confirmTwoFactorSetup({
      userId: user.userId,
      code: dto.code,
    });

    return this.formatResponse(data, 'AUTH_2FA_ENABLED', 'Bật 2FA thành công');
  }

  @Post('2fa/disable')
  @UseGuards(StrictJwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async disableTwoFactor(
    @Req() req: Request,
    @Body() dto: DisableTwoFactorDto,
  ) {
    const user = req.user as JwtUser;
    const data = await this.authService.disableTwoFactor({
      userId: user.userId,
      password: dto.password,
      code: dto.code,
      recoveryCode: dto.recoveryCode,
    });

    return this.formatResponse(
      data,
      'AUTH_2FA_DISABLED',
      'Tắt 2FA thành công, vui lòng đăng nhập lại',
    );
  }

  @Post('2fa/recovery-codes/regenerate')
  @UseGuards(StrictJwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async regenerateTwoFactorRecoveryCodes(
    @Req() req: Request,
    @Body() dto: RegenerateTwoFactorRecoveryCodesDto,
  ) {
    const user = req.user as JwtUser;
    const data = await this.authService.regenerateTwoFactorRecoveryCodes({
      userId: user.userId,
      password: dto.password,
      code: dto.code ?? dto.credential,
      recoveryCode: dto.recoveryCode,
    });

    return this.formatResponse(
      data,
      'AUTH_2FA_RECOVERY_CODES_REGENERATED',
      'Tạo lại recovery codes thành công',
    );
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const user = req.user as JwtUser;
    await this.authService.logout({
      userId: user.userId,
      deviceId: user.deviceId,
      accessJti: user.jti,
      accessExp: user.exp,
    });

    this.clearRefreshTokenCookie(res);

    return this.formatResponse(
      null,
      'AUTH_LOGOUT_SUCCESS',
      'Đăng xuất thành công',
    );
  }

  @Get('sessions')
  @UseGuards(StrictJwtAuthGuard)
  async listSessions(@Req() req: Request) {
    const user = req.user as JwtUser;
    const data = await this.authService.listUserSessions({
      userId: user.userId,
      currentDeviceId: user.deviceId,
    });

    return this.formatResponse(
      data,
      'AUTH_LIST_SESSIONS_SUCCESS',
      'Lấy danh sách phiên đăng nhập thành công',
    );
  }

  @Post('logout-device')
  @UseGuards(StrictJwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logoutDevice(@Req() req: Request, @Body() dto: LogoutDeviceDto) {
    const user = req.user as JwtUser;

    if (dto.deviceId === user.deviceId) {
      throw new BadRequestException({
        code: 'CURRENT_DEVICE_LOGOUT_NOT_ALLOWED',
        message: 'Không thể đăng xuất thiết bị hiện tại',
      });
    }

    await this.authService.logoutDevice({
      userId: user.userId,
      deviceId: dto.deviceId,
    });

    return this.formatResponse(
      null,
      'AUTH_LOGOUT_DEVICE_SUCCESS',
      'Đăng xuất thiết bị thành công',
    );
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logoutAll(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = req.user as JwtUser;
    await this.authService.logoutAll({ userId: user.userId });

    this.clearRefreshTokenCookie(res);

    return this.formatResponse(
      null,
      'AUTH_LOGOUT_ALL_SUCCESS',
      'Đăng xuất tất cả thiết bị thành công',
    );
  }

  @Get('admin/users')
  @UseGuards(StrictJwtAuthGuard, AdminGuard, PermissionsGuard)
  @Permissions('user.read')
  async listUsers(@Query() query: ListUsersQueryDto) {
    const data = await this.authService.listUsers({
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      search: query.search,
      role: query.role,
      isActive: query.isActive,
    });

    return this.formatResponse(
      data,
      'AUTH_LIST_USERS_SUCCESS',
      'Lấy danh sách người dùng thành công',
    );
  }

  @Get('admin/users/:userId')
  @UseGuards(StrictJwtAuthGuard, AdminGuard, PermissionsGuard)
  @Permissions('user.read')
  async getUserDetail(@Param('userId') userId: string) {
    const data = await this.authService.getProfile({ userId });

    return this.formatResponse(
      data,
      'AUTH_GET_USER_DETAIL_SUCCESS',
      'Lấy chi tiết người dùng thành công',
    );
  }

  @Patch('admin/users/:userId/status')
  @UseGuards(StrictJwtAuthGuard, AdminGuard, PermissionsGuard)
  @Permissions('user.status.update')
  async setUserStatus(
    @Param('userId') userId: string,
    @Body() setUserStatusDto: SetUserStatusDto,
    @Req() req: Request,
  ) {
    const admin = req.user as JwtUser;
    const data = await this.authService.setUserStatus({
      actorUserId: admin.userId,
      targetUserId: userId,
      isActive: setUserStatusDto.isActive,
    });

    return this.formatResponse(
      data,
      'AUTH_SET_USER_STATUS_SUCCESS',
      'Cập nhật trạng thái người dùng thành công',
    );
  }

  @Post('admin/users/:userId/revoke-sessions')
  @UseGuards(StrictJwtAuthGuard, AdminGuard, PermissionsGuard)
  @Permissions('user.sessions.revoke')
  @HttpCode(HttpStatus.OK)
  async adminRevokeUserSessions(
    @Param('userId') userId: string,
    @Req() req: Request,
  ) {
    const admin = req.user as JwtUser;
    await this.authService.adminRevokeUserSessions({
      actorUserId: admin.userId,
      targetUserId: userId,
    });

    return this.formatResponse(
      null,
      'AUTH_ADMIN_REVOKE_USER_SESSIONS_SUCCESS',
      'Thu hồi toàn bộ phiên của người dùng thành công',
    );
  }

  @Post('admin/users/:userId/reset-2fa')
  @UseGuards(StrictJwtAuthGuard, AdminGuard, PermissionsGuard)
  @Permissions('user.2fa.reset')
  @HttpCode(HttpStatus.OK)
  async adminResetUserTwoFactor(
    @Param('userId') userId: string,
    @Req() req: Request,
  ) {
    const admin = req.user as JwtUser;
    const data = await this.authService.adminResetUserTwoFactor({
      actorUserId: admin.userId,
      targetUserId: userId,
    });

    return this.formatResponse(
      data,
      'AUTH_ADMIN_RESET_2FA_SUCCESS',
      'Đặt lại 2FA cho người dùng thành công',
    );
  }

  @Patch('admin/users/:userId/role')
  @UseGuards(StrictJwtAuthGuard, AdminGuard, PermissionsGuard)
  @Permissions('user.role.update')
  async setUserRole(
    @Param('userId') userId: string,
    @Body() dto: SetUserRoleDto,
    @Req() req: Request,
  ) {
    const admin = req.user as JwtUser;
    const data = await this.authService.setUserRole({
      actorUserId: admin.userId,
      targetUserId: userId,
      role: dto.role,
    });

    return this.formatResponse(
      data,
      'AUTH_SET_USER_ROLE_SUCCESS',
      'Cập nhật role người dùng thành công',
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

  private setRefreshTokenCookie(res: Response, data: AuthResponse) {
    if (!data.refreshToken || data.twoFactorRequired) {
      return;
    }

    res.cookie(AuthController.REFRESH_COOKIE_NAME, data.refreshToken, {
      httpOnly: true,
      secure: this.refreshCookieSecure(),
      sameSite: 'lax',
      path: this.refreshCookiePath(),
      maxAge: this.refreshCookieMaxAgeMs(),
    });
  }

  private clearRefreshTokenCookie(res: Response) {
    res.clearCookie(AuthController.REFRESH_COOKIE_NAME, {
      httpOnly: true,
      secure: this.refreshCookieSecure(),
      sameSite: 'lax',
      path: this.refreshCookiePath(),
    });
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

  private refreshCookiePath() {
    const prefix = this.configService.get<string>('API_PREFIX') ?? '';
    const normalizedPrefix = prefix.replace(/^\/+|\/+$/g, '');

    return normalizedPrefix
      ? `/${normalizedPrefix}/auth/refresh`
      : '/auth/refresh';
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
