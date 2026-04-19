import { IsString, IsNumber, IsOptional } from 'class-validator';

export class CreatePointDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber()
  latitude: number;

  @IsNumber()
  longitude: number;
}
