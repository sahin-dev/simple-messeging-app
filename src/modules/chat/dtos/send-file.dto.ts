import { IsArray, IsMongoId, IsNotEmpty, IsNumber, IsOptional, IsString } from "class-validator";

export class SendFileDto {
    @IsMongoId()
    @IsString()
    @IsNotEmpty()
    receiver_id: string;

    @IsString()
    @IsOptional()
    message?: string;

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
}

export class SendVoiceDto extends SendFileDto {
    @IsNumber()
    @IsOptional()
    durationSeconds?: number;

    @IsArray()
    @IsOptional()
    waveform?: number[];
}
