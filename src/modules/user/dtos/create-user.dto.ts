import { Transform } from "class-transformer"
import { IsBoolean, IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, MinLength } from "class-validator"
import { VehicleType } from "generated/prisma/enums";

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

    @IsEnum(VehicleType)
    @IsOptional()
    vehicle_type?: VehicleType

    @IsString()
    @IsOptional()
    vehicle_model?: string

    @IsString()
    @IsOptional()
    vehicle_color?: string
}