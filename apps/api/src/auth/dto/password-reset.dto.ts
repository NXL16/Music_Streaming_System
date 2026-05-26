import { IsEmail, IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';

export class RequestPasswordResetDto {
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email!: string;
}

export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty({ message: 'Token đặt lại mật khẩu là bắt buộc' })
  token!: string;

  @IsString()
  @MinLength(8, { message: 'Mật khẩu mới phải có ít nhất 8 ký tự' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).+$/, {
    message:
      'Mật khẩu mới phải chứa chữ hoa, chữ thường, số và ký tự đặc biệt',
  })
  newPassword!: string;
}
