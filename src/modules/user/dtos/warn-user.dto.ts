import { IsMongoId, IsNotEmpty, IsString } from "class-validator"

export class WarnUserDto {

    @IsString()
    @IsMongoId()
    @IsNotEmpty()
    userId:string

    @IsString()
    @IsNotEmpty()
    reason:string   
}