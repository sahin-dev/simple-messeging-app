import { Type } from 'class-transformer';
import { IsNumber, IsOptional } from 'class-validator';

export class PaginationDto {
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  page: number = 1;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  limit: number = 10;
}
