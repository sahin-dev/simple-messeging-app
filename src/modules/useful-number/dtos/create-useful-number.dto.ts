import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, Min, ValidateIf } from 'class-validator';

export enum UsefulNumberCategoryDto {
  EMERGENCY_CONTACT = 'EMERGENCY_CONTACT',
  VEHICLE_ASSISTANCE = 'VEHICLE_ASSISTANCE',
  TRAFFIC_AND_PARKING = 'TRAFFIC_AND_PARKING',
}

export class CreateUsefulNumberDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  phone: string;

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

  @ValidateIf((dto) => dto.longitude !== undefined)
  @IsNumber()
  latitude?: number;

  @ValidateIf((dto) => dto.latitude !== undefined)
  @IsNumber()
  longitude?: number;
}
