import { Transform } from "class-transformer";
import { IsEmail, IsNotEmpty, IsNumber, IsString } from "class-validator";

export class VerifyOtpDto {
    @IsString()
    @IsNotEmpty()
    otp: string

    @IsNotEmpty()
    @IsEmail()
    email: string


}