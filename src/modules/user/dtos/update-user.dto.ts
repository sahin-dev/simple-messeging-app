import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { VehicleType } from "generated/prisma/enums";

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
}