import { Expose, Type } from "class-transformer"
import { PaginationResponseDto } from "src/common/dtos/pagination-response.dto"

export class NotificationResponseDto {
    
    @Expose()
    title:string

    @Expose()
    message:string

    @Expose()
    is_read:boolean

    @Expose()
    @Type(() => Date)
    createdAt:Date
}