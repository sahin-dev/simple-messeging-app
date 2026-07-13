import { Type } from 'class-transformer';
import { IsMongoId, IsNumber, IsOptional, IsString } from 'class-validator';

export class SendGroupMessageDto {
  @IsMongoId()
  @IsString()
  groupChatRoomId: string;

  @IsString()
  message: string;

  @IsString()
  @IsOptional()
  encryptionType?: string;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  encryptionVersion?: number;

  @IsMongoId()
  @IsString()
  @IsOptional()
  senderKeyId?: string;

  @IsString()
  @IsOptional()
  nonce?: string;

  @IsOptional()
  encryptedKeys?: Array<Record<string, any>> | string;
}
