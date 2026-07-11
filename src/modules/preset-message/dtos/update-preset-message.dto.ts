import { IsBoolean, IsEnum, IsString, IsOptional } from 'class-validator';
import { PresetMessageTypeDto } from './create-preset-message.dto';

export class UpdatePresetMessageDto {
  @IsOptional()
  @IsString()
  message_en?: string;

  @IsOptional()
  @IsString()
  message_it?: string;

  @IsOptional()
  @IsEnum(PresetMessageTypeDto)
  type?: PresetMessageTypeDto;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
