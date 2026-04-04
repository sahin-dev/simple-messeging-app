import { IsString, IsNotEmpty, MinLength, MaxLength } from "class-validator";

export class CreateBlacklistedwordDto {
    @IsString()
    @IsNotEmpty()
    @MinLength(1)
    @MaxLength(255)
    word: string;
}
