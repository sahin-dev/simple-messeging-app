import { IsArray, IsMongoId, IsNotEmpty, IsString } from "class-validator";

export class MessageAcknowledgementDto {
    @IsArray()
    @IsString({each:true})
    @IsMongoId({each:true})
    @IsNotEmpty()
    messageIds: string[];
}