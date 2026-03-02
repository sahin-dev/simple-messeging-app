import { IsMongoId, IsNotEmpty, IsString } from "class-validator";

export class BlockUnblockDto {

    @IsMongoId()
    @IsString()
    @IsNotEmpty()
    userId:string
}