import { Transform } from 'class-transformer';
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
  @IsNotEmpty()
  @MinLength(3, { message: 'Username phải có ít nhất 3 ký tự' })
  @MaxLength(50, { message: 'Username tối đa 50 ký tự' })
  @Matches(/^[a-zA-Z0-9_]+$/, {
    message: 'Username chỉ chứa chữ, số và dấu gạch dưới',
  })
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
  @IsNotEmpty({ message: 'Mật khẩu không được để trống' })
  @MinLength(8, { message: 'Mật khẩu phải có ít nhất 8 ký tự' })
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
    {
      message:
        'Mật khẩu phải chứa chữ hoa, chữ thường, số và ký tự đặc biệt',
    },
  )
  password!: string;

  @IsString({message: 'Tên hiển thị phải là chuỗi'})
  @IsNotEmpty({ message: 'Tên hiển thị không được để trống' })
  @MinLength(3, { message: 'Tên hiển thị phải có ít nhất 2 ký tự' })
  @MaxLength(100, { message: 'Tên hiển thị tối đa 100 ký tự' })
  displayName!: string;

  @IsOptional()
  @IsUUID('4', { message: 'Device ID phải là UUID hợp lệ' })
  deviceId?: string;
}
