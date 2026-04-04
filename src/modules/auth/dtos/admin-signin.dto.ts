import { Transform } from "class-transformer";
import { IsEmail, IsNotEmpty, IsString } from "class-validator";

export class AdminSigninDto {
    @IsEmail()
    @IsNotEmpty()
    @Transform(({ value }) => value.trim().toLowerCase())
    email: string;

    @IsString()
    @IsNotEmpty()
    password: string;
}