import { IsUUID } from 'class-validator';

export class GetRoomProfileDto {
  @IsUUID()
  userId!: string;
}
