import { Transform, TransformFnParams } from "class-transformer";
import { IsOptional, IsString, Length, MaxLength, MinLength } from "class-validator";

const trimValue = ({ value }: TransformFnParams) => typeof value === "string" ? value.trim() : value;

export class CheckAuthAvailabilityDto {
    @IsString()
    @IsOptional()
    @MinLength(3)
    @MaxLength(30)
    @Transform(trimValue)
    nick_name?: string

    @IsString()
    @IsOptional()
    @Length(6, 7, {
        message: "Licence ID must be 6 or 7 characters long"
    })
    @Transform(trimValue)
    licence_id?: string

    @IsString()
    @IsOptional()
    @Length(6, 7, {
        message: "License ID must be 6 or 7 characters long"
    })
    @Transform(trimValue)
    license_id?: string
}
