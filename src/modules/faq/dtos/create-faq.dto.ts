import { IsNotEmpty, IsString } from "class-validator";

export class CreateFaqDto {
    @IsString()
    @IsNotEmpty()
    title: string

    @IsString()
    @IsNotEmpty()
    description: string
}
