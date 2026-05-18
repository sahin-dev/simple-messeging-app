import { IsNumber, IsNotEmpty, IsOptional, Min, Max } from "class-validator";

export class UpdateUserLocationDto {
  @IsNumber()
  @IsNotEmpty()
  @Min(-90)
  @Max(90)
  latitude: number;

  @IsNumber()
  @IsNotEmpty()
  @Min(-180)
  @Max(180)
  longitude: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  accuracy?: number;
}
