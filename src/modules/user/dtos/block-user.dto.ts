import { IsMongoId, IsNotEmpty, IsString } from "class-validator";

export class TogggleBlockUserDto {

    @IsString()
    @IsNotEmpty()
    @IsMongoId()
    userId:string
}