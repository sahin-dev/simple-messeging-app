import { Transform } from "class-transformer"
import { IsEmail, IsNotEmpty, IsNumber, Length } from "class-validator"

export class VerifyEmailDto{
    @IsEmail()
    @IsNotEmpty()
    email:string

    @IsNumber()
    @IsNotEmpty()
    @Transform(obj => Number(obj.value))
    code:number
}