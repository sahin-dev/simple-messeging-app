import { Transform, Type } from "class-transformer";
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min, MinLength } from "class-validator";
import { Gender, VehicleType } from "generated/prisma/enums";
import { transformGender } from "src/common/transformers/gender.transformer";

export class UpdateUserDto {
    @IsString()
    @IsOptional()
    @MinLength(3)
    @MaxLength(30)
    @IsNotEmpty()
    nick_name?: string;

    @IsString()
    @IsOptional()
    @IsNotEmpty()
    name?: string;

    @IsEnum(VehicleType)
    @IsOptional()
    vehicle_type?: VehicleType;

    @IsString()
    @IsOptional()
    vehicle_model?: string;

    @IsString()
    @IsOptional()
    vehicle_color?: string;

    @IsString()
    @IsOptional()
    country?: string;

    @IsString()
    @IsOptional()
    city?: string;

    @IsEnum(Gender)
    @Transform(transformGender)
    @IsOptional()
    gender?: Gender;

    @Type(() => Number)
    @IsInt()
    @Min(1000)
    @Max(new Date().getFullYear() - 16, {
        message: "User age must be 16 or greater"
    })
    @IsOptional()
    birth_year?: number;
}
