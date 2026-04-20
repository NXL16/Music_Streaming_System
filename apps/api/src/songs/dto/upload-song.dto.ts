import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  Matches,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class UploadSongDto {
  @IsString({ message: 'Tên bài hát phải là chuỗi' })
  @IsNotEmpty({ message: 'Tên bài hát không được để trống' })
  @MinLength(1, { message: 'Tên bài hát phải có ít nhất 1 ký tự' })
  @MaxLength(100, { message: 'Tên bài hát tối đa 100 ký tự' })
  @Matches(/^[^<>$%{}[\]|\\^~]*$/, {
    message: 'Tên bài hát chứa ký tự không hợp lệ (@<>$%{}[]|\\^~)',
  })
  title!: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true' || normalized === '1') return true;
      if (normalized === 'false' || normalized === '0') return false;
    }
    return value;
  })
  @IsBoolean({ message: 'isPublic phải là boolean (true/false)' })
  isPublic?: boolean;

  // @IsOptional()
  // @IsString()
  // @MaxLength(255)
  // album?: string;

  // @IsOptional()
  // @IsString()
  // @MaxLength(50)
  // genre?: string;

  // @IsOptional()
  // @IsString()
  // @MaxLength(1000)
  // description?: string;
}
