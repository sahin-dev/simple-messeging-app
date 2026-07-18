import { IsNotEmpty, IsString } from "class-validator";

export class GoogleAuthStatusDto {
    @IsString()
    @IsNotEmpty()
    idToken: string
}
