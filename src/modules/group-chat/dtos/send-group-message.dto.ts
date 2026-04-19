import { IsString } from 'class-validator';

export class SendGroupMessageDto {
  @IsString()
  groupChatRoomId: string;

  @IsString()
  message: string;
}
