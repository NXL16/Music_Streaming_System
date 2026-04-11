import { IsOptional, IsString, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class GetSongsQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string; // Nhận _id của bài hát cuối cùng từ lần fetch trước

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  genre?: string;

  @IsOptional()
  @IsString()
  search?: string;
}
