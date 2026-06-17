import { IsNotEmpty, IsString } from 'class-validator';

export class ReserveParkingSpotDto {
  @IsString()
  @IsNotEmpty()
  spotId: string;
}
