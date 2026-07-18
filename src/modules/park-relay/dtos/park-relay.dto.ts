import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
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

  @IsOptional()
  @IsEnum(ParkingCost)
  parkingType?: ParkingCost;

  @ValidateIf((dto) => dto.parkingType === ParkingCost.PAID)
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  durationMin?: number;

  @ValidateIf((dto) => dto.parkingType === ParkingCost.PAID)
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  photoUrl?: string;
}

export class CreateParkingSessionDto extends ParkingCoordinatesDto {
  @IsOptional()
  @IsString()
  spotId?: string;

  @IsEnum(ParkingCost)
  costType: ParkingCost;

  @ValidateIf((dto) => dto.costType === ParkingCost.PAID)
  @IsOptional()
  @IsNumber()
  durationMin?: number;

  @ValidateIf((dto) => dto.costType === ParkingCost.PAID)
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class ParkedEventDto extends SaveParkingLocationDto {
  @IsOptional()
  @IsBoolean()
  createPaidParkingPrompt?: boolean;
}

export class AnswerPaidParkingPromptDto {
  @IsEnum(ParkingCost)
  parkingType: ParkingCost;

  @ValidateIf((dto) => dto.parkingType === ParkingCost.PAID)
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  durationMin?: number;

  @ValidateIf((dto) => dto.parkingType === ParkingCost.PAID)
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
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

export class SubmitParkingAreaPointDto {
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
}

export class SearchParkingAreaDto {
  @IsOptional()
  @IsString()
  query?: string;

  @IsOptional()
  @IsEnum(ParkingCost)
  parkingCost?: ParkingCost;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    return value;
  })
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  longitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  radiusMeters?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number;
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
