import { Expose, Type } from "class-transformer";
import { UserResponseDto } from "./user-response.dto";
import { ValidateNested } from "class-validator";
import { PaginationResponseDto } from "src/common/dtos/pagination-response.dto";

export class AllUsersResponseDto extends PaginationResponseDto{
    @Expose()
     @ValidateNested()
    @Type(() => UserResponseDto)
    users:Array<UserResponseDto>

    @Expose()
    page:number

    @Expose()
    limit:number

    @Expose()
    pages:number

 
}