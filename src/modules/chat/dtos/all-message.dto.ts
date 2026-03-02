import { PaginationResponseDto } from "src/common/dtos/pagination-response.dto";
import { SingleMessageDto } from "./single-message.dto";
import { Expose, Type } from "class-transformer";
import { ValidateNested } from "class-validator";

export class AllMessageDto extends PaginationResponseDto {

    @Expose()
    @ValidateNested({ each: true })
    @Type(() => SingleMessageDto)
    messages: SingleMessageDto[]


}