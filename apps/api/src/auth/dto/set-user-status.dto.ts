import { IsBoolean } from 'class-validator';

export class SetUserStatusDto {
  @IsBoolean({ message: 'isActive phải là boolean' })
  isActive!: boolean;
}
