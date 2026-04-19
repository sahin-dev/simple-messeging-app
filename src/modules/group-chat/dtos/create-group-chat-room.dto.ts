import { IsString, IsOptional, IsArray } from 'class-validator';

export class CreateGroupChatRoomDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  image?: string;

  @IsArray()
  @IsString({ each: true })
  memberIds: string[];
}
