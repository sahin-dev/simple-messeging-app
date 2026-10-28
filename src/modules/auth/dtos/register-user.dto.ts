import { Transform, Type } from "class-transformer";
import { IsBoolean, IsEmail, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Length, Max, MaxLength, Min, MinLength } from "class-validator";
import { Gender, VehicleType } from "generated/prisma/enums";
import { transformGender } from "src/common/transformers/gender.transformer";

export class RegisterUserDto {

        @IsString()
        @IsNotEmpty()
        @Length(6, 7, {
                message: "Licence ID must be 6 or 7 characters long"
        })
        licence_id: string

        @IsEmail()
        @IsNotEmpty()
        @Transform(({ value }) => value.trim().toLowerCase())
        email: string

        @IsString()
        @IsNotEmpty()
        @MinLength(3)
        @MaxLength(30)
        nick_name: string

        @IsString()
        @IsNotEmpty()
        @MinLength(6)
        password: string

        @IsString()
        @IsNotEmpty()
        @MinLength(6)
        confirmPassword: string

        @IsString()
        @IsNotEmpty()
        @MinLength(3)
        @MaxLength(30)
        designation: string

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

        @IsBoolean()
        @IsNotEmpty()
        @IsOptional()
        is_more_options_accepted:boolean

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
