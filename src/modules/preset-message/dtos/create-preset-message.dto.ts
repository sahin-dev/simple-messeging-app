import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';

export enum PresetMessageTypeDto {
  ALERT = 'ALERT',
  CLASSIC = 'CLASSIC',
}

export class CreatePresetMessageDto {
  @IsString()
  message_en: string;

  @IsString()
  message_it: string;

  @IsOptional()
  @IsEnum(PresetMessageTypeDto)
  type?: PresetMessageTypeDto;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
