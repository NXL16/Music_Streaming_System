import { IsIn, IsDivisibleBy, Min, Max, IsInt } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateDepositDto {
  @Type(() => Number)
  @IsInt({ message: 'Số tiền nạp phải là số nguyên' })
  @IsDivisibleBy(1000, { message: 'Số tiền nạp phải chẵn theo mệnh giá hàng nghìn' })
  @Min(10000, { message: 'Số tiền nạp tối thiểu là 10.000đ' })
  @Max(10000000, { message: 'Số tiền nạp tối đa một lần là 10.000.000đ' })
  amountVnd!: number;

  @IsIn(['MOMO', 'NFBANK'], { message: 'Phương thức thanh toán không hợp lệ' })
  paymentMethod!: 'MOMO' | 'NFBANK';
}
