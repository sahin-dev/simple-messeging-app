import { Expose, Type } from "class-transformer";
import { NotificationResponseDto } from "./notifications-response.dto";
import { ValidateNested } from "class-validator";
import { PaginationResponseDto } from "src/common/dtos/pagination-response.dto";

export class UserNotificationsResponseDto extends PaginationResponseDto{

    @Expose()
    @ValidateNested()
    @Type(() => NotificationResponseDto)
    notifications:NotificationResponseDto[]
}