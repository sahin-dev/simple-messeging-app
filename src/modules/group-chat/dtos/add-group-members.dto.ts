import { IsArray, IsString } from 'class-validator';

export class AddGroupMembersDto {
  @IsArray()
  @IsString({ each: true })
  memberIds: string[];
}
