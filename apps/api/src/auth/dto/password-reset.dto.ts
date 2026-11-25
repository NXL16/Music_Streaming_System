import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
import { AUTH_PASSWORD_PATTERN } from '@musical/shared-constants';

export class RequestPasswordResetDto {
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email!: string;
}

export class PasswordResetTokenDto {
  @IsString()
  @IsNotEmpty({ message: 'Token đặt lại mật khẩu là bắt buộc' })
  token!: string;
}

export class ResetPasswordDto extends PasswordResetTokenDto {
  @IsString()
  @MinLength(8, { message: 'Mật khẩu mới phải có ít nhất 8 ký tự' })
  @Matches(AUTH_PASSWORD_PATTERN, {
    message: 'Mật khẩu mới phải chứa chữ hoa, chữ thường, số và ký tự đặc biệt',
  })
  newPassword!: string;
}
