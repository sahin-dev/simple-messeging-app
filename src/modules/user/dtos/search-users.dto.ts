import { IsNotEmpty, IsString } from "class-validator";
import { PaginationDto } from "src/common/dtos/pagination.dto";

export class SearchUsersDto extends PaginationDto {
    @IsString()
    @IsNotEmpty()
    query: string;
}
