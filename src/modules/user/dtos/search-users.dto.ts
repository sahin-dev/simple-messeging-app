import { Transform } from "class-transformer";
import { IsEnum, IsNotEmpty, IsOptional, IsString } from "class-validator";
import { PaginationDto } from "src/common/dtos/pagination.dto";


enum SearchFor {
        GROUP = "group",
    
}
export class SearchUsersDto extends PaginationDto {
    @IsString()
    @IsNotEmpty()
    @Transform(({ value }) => value.trim().toLowerCase())
    query: string;

    @IsString()
    @IsNotEmpty()
    @Transform(({ value }) => value.trim().toLowerCase())
    @IsEnum(SearchFor)
    @IsOptional()
    for: SearchFor;

    @IsString()
    @IsNotEmpty()
    @IsOptional()
    roomId?: string;
}
