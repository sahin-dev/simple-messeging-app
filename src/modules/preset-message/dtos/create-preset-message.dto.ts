import { IsString } from 'class-validator';

export class CreatePresetMessageDto {
  @IsString()
  message_en: string;

  @IsString()
  message_it: string;
}
