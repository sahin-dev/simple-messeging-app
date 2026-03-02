import { IsEmail, IsNotEmpty, IsString, MinLength } from "class-validator"

export class ResetPasswordDto {

    @IsString()
    @IsNotEmpty()
    token: string

    @IsString()
    @IsNotEmpty()
    @MinLength(6)
    password: string

    @IsEmail()
    @IsNotEmpty()
    email: string

}