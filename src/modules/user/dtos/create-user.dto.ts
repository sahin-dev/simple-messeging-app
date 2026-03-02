import { Transform } from "class-transformer"
import { IsBoolean, IsEmail, isNotEmpty, IsNotEmpty, IsString, MinLength } from "class-validator"

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
}