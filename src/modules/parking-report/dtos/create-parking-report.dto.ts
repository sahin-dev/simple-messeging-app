import { IsString, IsNumber, IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { ParkingType, ParkingCost, DisabledFacilityLocation } from 'src/common/enums';

export class CreateParkingReportDto {


  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;

  @IsOptional()
  @IsString()
  spotId?: string;

  @IsEnum(ParkingCost)
  parking_cost: ParkingCost;

  @IsBoolean()
  electric_charging: boolean;

  @IsBoolean()
  disabled_facility: boolean;

  @IsEnum(DisabledFacilityLocation)
  @IsOptional()
  disabled_facility_location: DisabledFacilityLocation;
}
