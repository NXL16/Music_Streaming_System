import { IsNotEmpty, IsString } from 'class-validator';

export class UploadCompleteRequestDto {
  @IsString()
  @IsNotEmpty()
  songId!: string;

  @IsString()
  @IsNotEmpty()
  objectKey!: string;
}
