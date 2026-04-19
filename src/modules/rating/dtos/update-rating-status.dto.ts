import { IsEnum, IsNotEmpty } from 'class-validator';
import { RatingStatus } from 'generated/prisma/enums';

export class UpdateRatingStatusDto {
  @IsEnum(RatingStatus)
  @IsNotEmpty()
  status: RatingStatus;
}
