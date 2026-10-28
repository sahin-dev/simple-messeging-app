import { Transform, Type } from "class-transformer"
import { IsBoolean, IsEmail, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min, MinLength } from "class-validator"
import { Gender, VehicleType } from "generated/prisma/enums";
import { transformGender } from "src/common/transformers/gender.transformer";

export class CreateUserDto {

    @IsNotEmpty()
    @IsString()
    @Transform(({ value }) => value.trim())
    readonly licence_id: string

    @IsNotEmpty()
    @IsString()
    @Transform(({ value }) => value.trim())
    readonly nick_name: string

    @IsString()
    @IsNotEmpty()
    @MinLength(6)
    readonly password: string

    @IsBoolean()
    @IsNotEmpty()
    is_more_options_accepted:boolean

    @IsEmail()
    @IsNotEmpty()
    email:string

    @IsEnum(Gender)
    @Transform(transformGender)
    @IsNotEmpty()
    gender: Gender

    @Type(() => Number)
    @IsInt()
    @Min(1000)
    @Max(new Date().getFullYear() - 16, {
        message: "User age must be 16 or greater"
    })
    @IsNotEmpty()
    birth_year: number

    @IsEnum(VehicleType)
    @IsOptional()
    vehicle_type?: VehicleType

    @IsString()
    @IsOptional()
    vehicle_model?: string

    @IsString()
    @IsOptional()
    vehicle_color?: string

    @IsString()
    @IsOptional()
    country?: string

    @IsString()
    @IsOptional()
    city?: string
}
