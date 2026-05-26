import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class LogoutDeviceDto {
  @IsString()
  @IsNotEmpty({ message: 'deviceId là bắt buộc' })
  @IsUUID('4', { message: 'deviceId phải là UUID hợp lệ' })
  deviceId!: string;
}
