import { IsString, IsNumber, IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { ParkingType, ParkingCost, DisabledFacilityLocation } from 'src/common/enums';

export class UpdateParkingReportDto {
  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;

  @IsOptional()
  @IsEnum(ParkingType)
  parking_type?: ParkingType;

  @IsOptional()
  @IsEnum(ParkingCost)
  parking_cost?: ParkingCost;

  @IsOptional()
  @IsBoolean()
  electric_charging?: boolean;

  @IsOptional()
  @IsBoolean()
  disabled_facility?: boolean;

  @IsOptional()
  @IsEnum(DisabledFacilityLocation)
  disabled_facility_location?: DisabledFacilityLocation;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
