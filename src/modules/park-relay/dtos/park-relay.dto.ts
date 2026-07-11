import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ParkingCost } from 'src/common/enums';

export enum ParkingSearchStatusDto {
  IDLE = 'IDLE',
  SEARCHING = 'SEARCHING',
  PARKED = 'PARKED',
}

export enum ParkingSaveSourceDto {
  AUTO = 'AUTO',
  MANUAL = 'MANUAL',
}

export class ParkingCoordinatesDto {
  @IsNumber()
  latitude: number;

  @IsNumber()
  longitude: number;
}

export class UpdateParkingModeDto extends ParkingCoordinatesDto {
  @IsOptional()
  @IsNumber()
  accuracy?: number;

  @IsOptional()
  @IsNumber()
  confidence?: number;
}

export class CreateParkingHandoffDto extends ParkingCoordinatesDto {
  @IsOptional()
  @IsString()
  spotId?: string;
}

export class SaveParkingLocationDto extends ParkingCoordinatesDto {
  @IsOptional()
  @IsNumber()
  accuracy?: number;

  @IsOptional()
  @IsNumber()
  confidence?: number;

  @IsOptional()
  @IsEnum(ParkingSaveSourceDto)
  source?: ParkingSaveSourceDto;
}

export class CreateParkingSessionDto extends ParkingCoordinatesDto {
  @IsOptional()
  @IsString()
  spotId?: string;

  @IsEnum(ParkingCost)
  costType: ParkingCost;

  @ValidateIf((dto) => dto.costType === ParkingCost.PAID)
  @IsNumber()
  durationMin?: number;
}

export class ParkingAreaPointDto extends ParkingCoordinatesDto {}

export class CreateParkingAreaDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber()
  centerLat: number;

  @IsNumber()
  centerLng: number;

  @IsArray()
  @ArrayMinSize(3)
  @ValidateNested({ each: true })
  @Type(() => ParkingAreaPointDto)
  polygon: ParkingAreaPointDto[];

  @IsEnum(ParkingCost)
  parkingCost: ParkingCost;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateParkingAreaDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  centerLat?: number;

  @IsOptional()
  @IsNumber()
  centerLng?: number;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(3)
  @ValidateNested({ each: true })
  @Type(() => ParkingAreaPointDto)
  polygon?: ParkingAreaPointDto[];

  @IsOptional()
  @IsEnum(ParkingCost)
  parkingCost?: ParkingCost;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
