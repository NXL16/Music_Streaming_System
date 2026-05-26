import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateProfileDto {
  @IsString({ message: 'Tên hiển thị phải là chuỗi' })
  @MinLength(2, { message: 'Tên hiển thị phải có ít nhất 2 ký tự' })
  @MaxLength(100, { message: 'Tên hiển thị tối đa 100 ký tự' })
  displayName!: string;

  @IsOptional()
  @IsString({ message: 'Avatar phải là chuỗi' })
  @MaxLength(500, { message: 'Avatar tối đa 500 ký tự' })
  avatar?: string;

  @IsOptional()
  @IsString({ message: 'Tiểu sử phải là chuỗi' })
  @MaxLength(500, { message: 'Tiểu sử tối đa 500 ký tự' })
  bio?: string;
}
