import { Transform } from "class-transformer"
import { IsIn, IsOptional } from "class-validator"
import { UserRole } from "generated/prisma/enums"
import { PaginationDto } from "src/common/dtos/pagination.dto"

export class UserQueryDto extends PaginationDto {

    @IsOptional()
    @Transform(obj => {
        if (obj.value)
            return obj.value === 'true' ? true : false
    })
    email_verified: boolean

    @IsOptional()
    query: string

    @IsOptional()
    email: string

    @IsOptional()
    createdAt: Date

    @IsIn([UserRole.USER, UserRole.ADMIN])
    @IsOptional()
    role: string


}