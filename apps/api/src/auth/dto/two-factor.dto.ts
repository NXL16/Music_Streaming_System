import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';
import {
  AUTH_TWO_FACTOR_CODE_PATTERN,
  AUTH_RECOVERY_CODE_PATTERN,
} from '@musical/shared-constants';

const totpCodeMessage = 'Mã 2FA phải gồm 6 chữ số';
const recoveryCodeMessage = 'Recovery code không hợp lệ';

export class ConfirmTwoFactorSetupDto {
  @IsString()
  @Matches(AUTH_TWO_FACTOR_CODE_PATTERN, { message: totpCodeMessage })
  code!: string;
}

export class DisableTwoFactorDto {
  @IsString()
  @IsNotEmpty({ message: 'Mật khẩu là bắt buộc' })
  password!: string;

  @IsOptional()
  @IsString()
  @Matches(AUTH_TWO_FACTOR_CODE_PATTERN, { message: totpCodeMessage })
  code?: string;

  @IsOptional()
  @IsString()
  @Matches(AUTH_RECOVERY_CODE_PATTERN, { message: recoveryCodeMessage })
  recoveryCode?: string;
}

export class VerifyTwoFactorLoginDto {
  @IsString()
  @IsNotEmpty({ message: 'challengeId là bắt buộc' })
  challengeId!: string;

  @IsOptional()
  @IsString()
  @Matches(AUTH_TWO_FACTOR_CODE_PATTERN, { message: totpCodeMessage })
  code?: string;

  @IsOptional()
  @IsString()
  @Matches(AUTH_RECOVERY_CODE_PATTERN, { message: recoveryCodeMessage })
  recoveryCode?: string;
}

export class RegenerateTwoFactorRecoveryCodesDto {
  @IsString()
  @IsNotEmpty({ message: 'Mật khẩu là bắt buộc' })
  password!: string;

  @IsOptional()
  @IsString()
  @Matches(AUTH_TWO_FACTOR_CODE_PATTERN, { message: totpCodeMessage })
  code?: string;

  @IsOptional()
  @IsString()
  @Matches(AUTH_RECOVERY_CODE_PATTERN, { message: recoveryCodeMessage })
  recoveryCode?: string;
}
