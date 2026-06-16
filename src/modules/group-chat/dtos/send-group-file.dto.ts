import { IsMongoId, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class SendGroupFileDto {
    @IsMongoId()
    @IsString()
    @IsNotEmpty()
    groupChatRoomId: string;

    @IsString()
    @IsOptional()
    message?: string;
}
