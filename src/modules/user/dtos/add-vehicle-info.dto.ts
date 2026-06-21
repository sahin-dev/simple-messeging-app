import { IsEnum, IsNotEmpty, IsString } from "class-validator";
import { VehicleType } from "generated/prisma/enums";

export class AddVehicleInfoDto {
    @IsEnum(VehicleType)
    @IsNotEmpty()
    readonly vehicle_type: VehicleType;

    @IsString()
    @IsNotEmpty()
    readonly vehicle_model: string;

    @IsString()
    @IsNotEmpty()
    readonly vehicle_color: string;
}
