import { IsString, IsOptional } from 'class-validator';

export class UpdatePresetMessageDto {
  @IsOptional()
  @IsString()
  message?: string;
}
