import { Expose, Type } from "class-transformer";
import { RoomDto } from "./room.dto";
import { ValidateNested } from "class-validator";
import { PaginationResponseDto } from "src/common/dtos/pagination-response.dto";

export class AllUserRoomsDto extends PaginationResponseDto{

    @Expose()
    @ValidateNested({ each: true })
    @Type(() => RoomDto)
    rooms:RoomDto[]

    
}