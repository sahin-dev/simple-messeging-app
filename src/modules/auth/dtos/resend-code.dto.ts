import { IsEmail, IsNotEmpty, IsString } from "class-validator"

export class ResendCodeDto{

    @IsEmail()
    email:string
}