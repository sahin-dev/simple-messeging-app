import { IsString, IsNumber, IsOptional } from 'class-validator';

export class CreateUsefulNumberDto {
  @IsString()
  title: string;

  @IsString()
  phone: string;

  @IsNumber()
  latitude: number;

  @IsNumber()
  longitude: number;
}
