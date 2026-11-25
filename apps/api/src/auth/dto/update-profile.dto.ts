import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { AUTH_DISPLAY_NAME_MAX_LENGTH } from '@musical/shared-constants';
import { Transform } from 'class-transformer';

export class UpdateProfileDto {
  @IsString({ message: 'Tên hiển thị phải là chuỗi' })
  @MinLength(2, { message: 'Tên hiển thị phải có ít nhất 2 ký tự' })
  @MaxLength(AUTH_DISPLAY_NAME_MAX_LENGTH, {
    message: 'Tên hiển thị tối đa 50 ký tự',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  displayName!: string;

  @IsOptional()
  @IsString({ message: 'Tiểu sử phải là chuỗi' })
  @MaxLength(500, { message: 'Tiểu sử tối đa 500 ký tự' })
  bio?: string;
}
