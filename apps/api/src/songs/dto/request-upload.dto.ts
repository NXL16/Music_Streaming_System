import { IsNotEmpty, IsNumber, IsString, Min } from 'class-validator';

export class RequestUploadDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  checksum!: string;

  @IsNumber()
  @Min(1)
  size!: number;
}
