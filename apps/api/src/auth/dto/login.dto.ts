import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class LoginDto {
  @IsString({ message: 'Thông tin đăng nhập phải là chuỗi' })
  @IsNotEmpty({ message: 'Vui lòng nhập email hoặc tên đăng nhập' })
  identifier!: string;

  @IsString()
  @IsNotEmpty({ message: 'Mật khẩu không được để trống' })
  password!: string;

  @IsOptional()
  @IsUUID('4', { message: 'Device ID phải là UUID hợp lệ' })
  deviceId?: string;
}
