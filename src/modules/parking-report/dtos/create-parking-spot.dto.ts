import { IsNumber, IsEnum, IsBoolean, IsOptional } from 'class-validator';
import { ParkingCost, DisabledFacilityLocation } from 'src/common/enums';

export class CreateParkingSpotDto {
  @IsNumber()
  latitude: number;

  @IsNumber()
  longitude: number;

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
