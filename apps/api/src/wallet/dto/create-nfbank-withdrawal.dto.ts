import { Type } from 'class-transformer';
import { IsDivisibleBy, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

export class CreateNFBankWithdrawalDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{6,30}$/, { message: 'Số tài khoản NF Bank không hợp lệ' })
  accountNumber?: string;

  @IsOptional()
  @IsString()
  bankAccountId?: string;

  @IsString()
  @Matches(/^\d{5}$/, { message: 'Mã PIN rút tiền phải gồm 5 chữ số' })
  pin!: string;

  @Type(() => Number)
  @IsInt({ message: 'Số tiền rút phải là số nguyên' })
  @IsDivisibleBy(1000, { message: 'Số tiền rút phải chẵn theo mệnh giá hàng nghìn' })
  @Min(10000, { message: 'Số tiền rút tối thiểu là 10.000đ' })
  @Max(10000000, { message: 'Số tiền rút tối đa một lần là 10.000.000đ' })
  amountVnd!: number;

  @IsString()
  @Matches(/^[A-Za-z0-9_-]{16,128}$/, { message: 'Khóa giao dịch không hợp lệ' })
  idempotencyKey!: string;
}
