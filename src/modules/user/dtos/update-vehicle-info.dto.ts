import { IsEnum, IsOptional, IsString } from "class-validator";
import { VehicleType } from "generated/prisma/enums";

export class UpdateVehicleInfoDto {
    @IsEnum(VehicleType)
    @IsOptional()
    readonly vehicle_type?: VehicleType;

    @IsString()
    @IsOptional()
    readonly vehicle_model?: string;

    @IsString()
    @IsOptional()
    readonly vehicle_color?: string;
}
