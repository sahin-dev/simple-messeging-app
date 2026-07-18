import { IsOptional, IsString } from "class-validator";

export class UpdateFaqDto {
    @IsString()
    @IsOptional()
    title?: string

    @IsString()
    @IsOptional()
    description?: string
}
