import { Transform } from "class-transformer";
import { IsNotEmpty, IsString } from "class-validator";
import { PaginationDto } from "src/common/dtos/pagination.dto";

export class SearchUsersDto extends PaginationDto {
    @IsString()
    @IsNotEmpty()
    @Transform(({ value }) => value.trim().toLowerCase())
    query: string;
}
