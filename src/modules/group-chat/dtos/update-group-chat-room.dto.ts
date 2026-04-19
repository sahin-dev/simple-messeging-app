import { IsString, IsOptional } from 'class-validator';

export class UpdateGroupChatRoomDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  image?: string;
}
