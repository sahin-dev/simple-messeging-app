import { IsMongoId, IsNotEmpty, IsOptional, IsString } from "class-validator";
import type{ FileBuffer } from "../types/file-buffer.type";

export class SendMessageDto {

    @IsMongoId()
    @IsString()
    @IsNotEmpty()
    receiver_id:string

    @IsString()
    @IsNotEmpty()
    @IsOptional()
    message:string

    @IsOptional()
    @IsNotEmpty()
    file:FileBuffer
}