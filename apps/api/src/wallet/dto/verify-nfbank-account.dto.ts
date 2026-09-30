import { IsString, Matches } from 'class-validator';

export class VerifyNFBankAccountDto {
  @IsString()
  @Matches(/^\d{6,30}$/, { message: 'Số tài khoản NF Bank không hợp lệ' })
  accountNumber!: string;
}
