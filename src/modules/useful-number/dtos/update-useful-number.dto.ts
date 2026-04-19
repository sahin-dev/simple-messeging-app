import { IsString, IsNumber, IsOptional } from 'class-validator';

export class UpdateUsefulNumberDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;
}
