import { IsString, IsNumber, IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { ParkingType, ParkingCost, DisabledFacilityLocation } from 'src/common/enums';

export class CreateParkingReportDto {
  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber()
  latitude: number;

  @IsNumber()
  longitude: number;

  @IsEnum(ParkingType)
  parking_type: ParkingType;

  @IsEnum(ParkingCost)
  parking_cost: ParkingCost;

  @IsBoolean()
  electric_charging: boolean;

  @IsBoolean()
  disabled_facility: boolean;

  @IsEnum(DisabledFacilityLocation)
  disabled_facility_location: DisabledFacilityLocation;
}
