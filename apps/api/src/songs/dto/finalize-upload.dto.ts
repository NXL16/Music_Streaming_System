import { IsNotEmpty, IsString } from 'class-validator';

export class FinalizeUploadDto {
  @IsString()
  @IsNotEmpty()
  songId!: string;
}
