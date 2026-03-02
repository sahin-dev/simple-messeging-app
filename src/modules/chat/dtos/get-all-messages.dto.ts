import { IsMongoId, IsNotEmpty, IsNumber, IsString } from "class-validator"
import { PaginationDto } from "src/common/dtos/pagination.dto"

export class GetAllMessagesDto extends PaginationDto {

    @IsString()
    @IsMongoId()
    @IsNotEmpty()
    roomId: string

}