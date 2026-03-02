import { IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class UpdateUserDto {
    @IsString()
    @IsOptional()
    @MinLength(3)
    @MaxLength(30)
    @IsNotEmpty()
    nick_name?: string;

    @IsString()
    @IsOptional()
    @IsNotEmpty()
    name?: string;
}