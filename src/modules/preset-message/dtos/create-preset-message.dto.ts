import { IsString } from 'class-validator';

export class CreatePresetMessageDto {
  @IsString()
  message: string;
}
