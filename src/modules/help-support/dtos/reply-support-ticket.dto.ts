import { IsNotEmpty, IsString } from "class-validator";

export class ReplySupportTicketDto {
    @IsString()
    @IsNotEmpty()
    reply: string;
}
