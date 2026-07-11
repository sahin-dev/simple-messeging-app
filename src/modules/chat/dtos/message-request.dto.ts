import { IsMongoId, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateMessageRequestDto {
  @IsMongoId()
  @IsString()
  @IsNotEmpty()
  receiverId: string;

  @IsString()
  @IsOptional()
  firstMessage?: string;

  @IsMongoId()
  @IsString()
  @IsOptional()
  presetMessageId?: string;
}

export class RegisterDeviceKeyDto {
  @IsString()
  @IsNotEmpty()
  deviceId: string;

  @IsString()
  @IsNotEmpty()
  publicKey: string;
}
