import { Transform, TransformFnParams } from "class-transformer";
import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { VehicleType } from "generated/prisma/enums";
import { IsFcmToken } from "src/common/validators/is-fcm-token.validator";

const trimValue = ({ value }: TransformFnParams) => typeof value === "string" ? value.trim() : value;

export class AppleSigninDto {
    @IsString()
    @IsNotEmpty()
    identityToken: string

    @IsString()
    @IsOptional()
    nonce?: string

    @IsString()
    @IsOptional()
    @Transform(trimValue)
    @IsFcmToken()
    fcm_token?: string

    @IsString()
    @IsOptional()
    @Transform(trimValue)
    name?: string

    @IsString()
    @IsOptional()
    @Transform(trimValue)
    licence_id?: string

    @IsString()
    @IsOptional()
    @MinLength(3)
    @MaxLength(30)
    @Transform(trimValue)
    nick_name?: string

    @IsString()
    @IsOptional()
    @MinLength(3)
    @MaxLength(30)
    designation?: string

    @IsBoolean()
    @IsOptional()
    is_more_options_accepted?: boolean

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
