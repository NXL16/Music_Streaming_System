import { IsString, Matches } from 'class-validator';

export class SetWithdrawPinDto {
  @IsString()
  @Matches(/^\d{5}$/, { message: 'Mã PIN rút tiền phải gồm 5 chữ số' })
  pin!: string;
}
