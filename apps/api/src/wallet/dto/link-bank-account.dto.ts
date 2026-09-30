import { IsOptional, IsString, Matches } from 'class-validator';

export class LinkBankAccountDto {
  @IsString()
  @Matches(/^\d{6,30}$/, { message: 'Số tài khoản NF Bank không hợp lệ' })
  accountNumber!: string;

  @IsString()
  @Matches(/^\d{5}$/, { message: 'Mã PIN rút tiền phải gồm 5 chữ số' })
  pin!: string;

  @IsOptional()
  @IsString()
  bankCode?: string;
}
