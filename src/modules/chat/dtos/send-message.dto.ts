import { IsMongoId, IsNotEmpty, IsNumber, IsOptional, IsString } from "class-validator";
import type{ FileBuffer } from "../types/file-buffer.type";

export class SendMessageDto {

    @IsMongoId()
    @IsString()
    @IsNotEmpty()
    @IsOptional()
    receiver_id:string
    
    @IsMongoId()
    @IsString()
    @IsNotEmpty()
    @IsOptional()
    room_id:string

    @IsString()
    @IsNotEmpty()
    @IsOptional()
    message:string

    @IsMongoId()
    @IsString()
    @IsOptional()
    presetMessageId?: string;

    @IsString()
    @IsOptional()
    encryptionType?: string;

    @IsNumber()
    @IsOptional()
    encryptionVersion?: number;

    @IsMongoId()
    @IsString()
    @IsOptional()
    senderKeyId?: string;

    @IsMongoId()
    @IsString()
    @IsOptional()
    receiverKeyId?: string;

    @IsString()
    @IsOptional()
    nonce?: string;

    @IsOptional()
    @IsNotEmpty()
    file:FileBuffer
}
