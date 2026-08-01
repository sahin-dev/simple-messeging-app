import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, Min, ValidateIf } from 'class-validator';
import { UsefulNumberCategoryDto } from './create-useful-number.dto';

export class UpdateUsefulNumberDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(UsefulNumberCategoryDto)
  category?: UsefulNumberCategoryDto;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @ValidateIf((dto) => dto.longitude !== undefined)
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @ValidateIf((dto) => dto.latitude !== undefined)
  @IsNumber()
  longitude?: number;
}
