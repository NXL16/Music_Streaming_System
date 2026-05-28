import { IsEnum } from 'class-validator';
import { UserRole } from '@musical/shared-types';

export class SetUserRoleDto {
  @IsEnum(UserRole)
  role!: UserRole;
}
