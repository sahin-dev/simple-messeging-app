import { Module } from "@nestjs/common";
import { UserController } from "./user.controller";
import { UserService } from "./user.service";
import { EncoderProvider } from "src/common/providres/encoder.provider";
import { SMTPProvider } from "src/common/providres/smtp.provider";
import { ChatService } from "../chat/chat.service";
import { PrismaModule } from "../prisma/prisma.module";
import { QrCodeGeneratorProvider } from "./providers/qrCodeGenerator.provider";

@Module({
    imports: [PrismaModule],
    controllers: [UserController],
    providers: [ UserService, EncoderProvider, SMTPProvider, ChatService , QrCodeGeneratorProvider],
    exports: [UserService, EncoderProvider, QrCodeGeneratorProvider]
})

export class UserModule {

}