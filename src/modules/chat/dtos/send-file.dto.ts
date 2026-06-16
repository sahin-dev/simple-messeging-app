import { IsMongoId, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class SendFileDto {
    @IsMongoId()
    @IsString()
    @IsNotEmpty()
    receiver_id: string;

    @IsString()
    @IsOptional()
    message?: string;
}
