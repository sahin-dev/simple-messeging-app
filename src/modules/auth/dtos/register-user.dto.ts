import { IsBoolean, IsEmail, IsNotEmpty, IsOptional, IsString, Length, MaxLength, MinLength, Validate } from "class-validator";

export class RegisterUserDto {

        @IsString()
        @IsNotEmpty()
        @Length(6, 7, {
                message: "Licence ID must be 6 or 7 characters long"
        })
        licence_id: string

        @IsEmail()
        @IsNotEmpty()
        email: string

        @IsString()
        @IsNotEmpty()
        @MinLength(3)
        @MaxLength(30)
        nick_name: string

        @IsString()
        @IsNotEmpty()
        @MinLength(6)
        password: string

        @IsString()
        @IsNotEmpty()
        @MinLength(6)
        confirmPassword: string

        @IsString()
        @IsNotEmpty()
        @MinLength(3)
        @MaxLength(30)
        designation: string

        @IsBoolean()
        @IsNotEmpty()
        @IsOptional()
        is_more_options_accepted:boolean

}