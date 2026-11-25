import { IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';
import { AUTH_PASSWORD_PATTERN } from '@musical/shared-constants';

export class VerifyCurrentPasswordDto {
  @IsString()
  @IsNotEmpty({ message: 'Enter your current password.' })
  currentPassword!: string;
}

export class ChangePasswordDto extends VerifyCurrentPasswordDto {
  @IsString()
  @MinLength(8, { message: 'Mật khẩu mới phải có ít nhất 8 ký tự' })
  @Matches(AUTH_PASSWORD_PATTERN, {
    message: 'Mật khẩu mới phải chứa chữ hoa, chữ thường, số và ký tự đặc biệt',
  })
  newPassword!: string;
}
