import { IsNotEmpty, IsString } from 'class-validator';

export class LeaveParkingSpotDto {
  @IsString()
  @IsNotEmpty()
  spotId: string;
}
