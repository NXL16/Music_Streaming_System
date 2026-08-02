import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ExchangeRoomCodeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  code!: string;
}
