import { Transform, TransformFnParams } from "class-transformer"
import { IsNotEmpty, IsOptional, IsString } from "class-validator"

export class SigninDto {

    @IsString()
    @IsNotEmpty()
    @Transform(({ value }: TransformFnParams) => String(value).trim())
    identifier: string // Can be licence_id or nick_name

    @IsString()
    @IsNotEmpty()
    @Transform(({ value }: TransformFnParams) => String(value).trim())
    password: string
    
    @IsString()
    @IsNotEmpty()
    @IsOptional()
    fcm_token?: string
}