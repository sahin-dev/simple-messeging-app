import { IsString, IsOptional, IsArray } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateGroupChatRoomDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  image?: string;

  @Transform(({ value }) => {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return value.split(',').map((id: string) => id.trim());
      }
    }
    return value;
  })
  @IsArray()
  @IsString({ each: true })
  memberIds: string[];
}

