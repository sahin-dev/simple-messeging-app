import { IsString, IsOptional } from 'class-validator';

export class UpdatePresetMessageDto {
  @IsOptional()
  @IsString()
  message_en?: string;

  @IsOptional()
  @IsString()
  message_it?: string;
}
