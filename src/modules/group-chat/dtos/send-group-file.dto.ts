import { Type } from "class-transformer";
import { IsMongoId, IsNotEmpty, IsNumber, IsOptional, IsString } from "class-validator";

export class SendGroupFileDto {
    @IsMongoId()
    @IsString()
    @IsNotEmpty()
    groupChatRoomId: string;

    @IsString()
    @IsOptional()
    message?: string;

    @IsString()
    @IsOptional()
    encryptionType?: string;

    @IsNumber()
    @IsOptional()
    @Type(() => Number)
    encryptionVersion?: number;

    @IsMongoId()
    @IsString()
    @IsOptional()
    senderKeyId?: string;

    @IsString()
    @IsOptional()
    nonce?: string;

    @IsOptional()
    encryptedKeys?: Array<Record<string, any>> | string;
}

export class SendGroupVoiceDto extends SendGroupFileDto {
    @IsNumber()
    @IsOptional()
    @Type(() => Number)
    durationSeconds?: number;

    @IsOptional()
    waveform?: number[] | string;
}
