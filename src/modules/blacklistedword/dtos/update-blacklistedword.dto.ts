import { IsString, IsNotEmpty, MinLength, MaxLength } from "class-validator";

export class UpdateBlacklistedwordDto {
    @IsString()
    @IsNotEmpty()
    @MinLength(1)
    @MaxLength(255)
    word: string;
}
