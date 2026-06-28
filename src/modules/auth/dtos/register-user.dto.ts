import { Transform } from "class-transformer";
import { IsBoolean, IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, Length, MaxLength, MinLength, Validate } from "class-validator";
import { VehicleType } from "generated/prisma/enums";

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