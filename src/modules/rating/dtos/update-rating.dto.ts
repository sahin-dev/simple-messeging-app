import { IsNumber, IsNotEmpty, IsOptional, Max, Min } from 'class-validator';

export class UpdateRatingDto {
  @IsNumber()
  @IsNotEmpty()
  @Min(1)
  @Max(5)
  rating: number;
}
