import { Module } from "@nestjs/common";
import { UserController } from "./user.controller";
import { PrismaService } from "../prisma/prisma.service";
import { UserService } from "./user.service";
import { EncoderProvider } from "src/common/providres/encoder.provider";
import { SMTPProvider } from "src/common/providres/smtp.provider";
import { ChatService } from "../chat/chat.service";
import { PrismaModule } from "../prisma/prisma.module";

@Module({
    imports: [PrismaModule],
    controllers: [UserController],
    providers: [ UserService, EncoderProvider, SMTPProvider, ChatService],
    exports: [UserService, EncoderProvider]
})

export class UserModule {

}