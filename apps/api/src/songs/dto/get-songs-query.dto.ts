import {
  IsOptional,
  IsString,
  IsNumber,
  Min,
  Max,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class GetSongsQueryDto {
  @IsOptional()
  @IsString({ message: 'Cursor phải là chuỗi' })
  @Matches(/^[a-f0-9]{24}$/, {
    message: 'Cursor phải là MongoDB ObjectId hợp lệ',
  })
  cursor?: string; // Nhận _id của bài hát cuối cùng từ lần fetch trước

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(1, { message: 'Limit phải lớn hơn 0' })
  @Max(50, { message: 'Limit tối đa 50 bài' })
  limit?: number = 20;

  @IsOptional()
  @IsString({ message: 'Genre phải là chuỗi' })
  @MaxLength(50, { message: 'Genre tối đa 50 ký tự' })
  genre?: string;

  @IsOptional()
  @IsString({ message: 'Search phải là chuỗi' })
  @MinLength(1, { message: 'Search phải có ít nhất 1 ký tự' })
  @MaxLength(100, { message: 'Search tối đa 100 ký tự' })
  search?: string;
}
