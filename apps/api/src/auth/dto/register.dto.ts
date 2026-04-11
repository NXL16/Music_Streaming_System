import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(50)
  @Matches(/^[a-zA-Z0-9_]+$/, {
    message: 'Username chỉ chứa chữ, số và dấu gạch dưới',
  })
  username!: string;

  @IsEmail({}, { message: 'Email không hợp lệ' })
  @IsNotEmpty()
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8, { message: 'Mật khẩu phải có ít nhất 8 ký tự' })
  // Regex: Ít nhất 1 hoa, 1 thường, 1 số, 1 ký tự đặc biệt
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
    {
      message: 'Mật khẩu phải chứa chữ hoa, chữ thường, số và ký tự đặc biệt',
    },
  )
  password!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  displayName!: string;
}
