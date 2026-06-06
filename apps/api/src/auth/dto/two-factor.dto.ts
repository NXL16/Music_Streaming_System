import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

const totpCodeMessage = 'Mã 2FA phải gồm 6 chữ số';
const recoveryCodeMessage = 'Recovery code không hợp lệ';

export class ConfirmTwoFactorSetupDto {
  @IsString()
  @Matches(/^\d{6}$/, { message: totpCodeMessage })
  code!: string;
}

export class DisableTwoFactorDto {
  @IsString()
  @IsNotEmpty({ message: 'Mật khẩu là bắt buộc' })
  password!: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/, { message: totpCodeMessage })
  code?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9-]{16,24}$/, { message: recoveryCodeMessage })
  recoveryCode?: string;
}

export class VerifyTwoFactorLoginDto {
  @IsString()
  @IsNotEmpty({ message: 'challengeId là bắt buộc' })
  challengeId!: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/, { message: totpCodeMessage })
  code?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9-]{16,24}$/, { message: recoveryCodeMessage })
  recoveryCode?: string;
}

export class RegenerateTwoFactorRecoveryCodesDto {
  @IsString()
  @IsNotEmpty({ message: 'Mật khẩu là bắt buộc' })
  password!: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/, { message: totpCodeMessage })
  code?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9-]{16,24}$/, { message: recoveryCodeMessage })
  recoveryCode?: string;
}
