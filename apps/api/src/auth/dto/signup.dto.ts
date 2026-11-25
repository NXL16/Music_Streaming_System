import { Transform } from 'class-transformer';
import {
  AUTH_DISPLAY_NAME_MAX_LENGTH,
  AUTH_USERNAME_PATTERN,
  AUTH_PASSWORD_PATTERN,
} from '@musical/shared-constants';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class SignupDto {
  @IsString()
  @MaxLength(50, { message: 'Username tối đa 50 ký tự' })
  @Matches(AUTH_USERNAME_PATTERN, {
    message: 'Username chỉ chứa chữ, số và dấu gạch dưới',
  })
  @MinLength(3, { message: 'Username phải có ít nhất 3 ký tự' })
  @IsNotEmpty({ message: 'Username không được để trống' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  username!: string;

  @IsEmail({}, { message: 'Email không hợp lệ' })
  @IsNotEmpty({ message: 'Email không được để trống' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email!: string;

  @IsString()
  @Matches(AUTH_PASSWORD_PATTERN, {
    message: 'Mật khẩu phải chứa chữ hoa, chữ thường, số và ký tự đặc biệt',
  })
  @MinLength(8, { message: 'Mật khẩu phải có ít nhất 8 ký tự' })
  @IsNotEmpty({ message: 'Mật khẩu không được để trống' })
  password!: string;

  @IsString({ message: 'Tên hiển thị phải là chuỗi' })
  @MaxLength(AUTH_DISPLAY_NAME_MAX_LENGTH, {
    message: 'Tên hiển thị tối đa 50 ký tự',
  })
  @MinLength(2, { message: 'Tên hiển thị phải có ít nhất 2 ký tự' })
  @IsNotEmpty({ message: 'Tên hiển thị không được để trống' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  displayName!: string;

  @IsOptional()
  @IsUUID('4', { message: 'Device ID phải là UUID hợp lệ' })
  deviceId?: string;
}
