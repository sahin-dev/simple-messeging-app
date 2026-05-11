import { Module, forwardRef } from "@nestjs/common";
import { UserController } from "./user.controller";
import { UserService } from "./user.service";
import { EncoderProvider } from "src/common/providres/encoder.provider";
import { SMTPProvider } from "src/common/providres/smtp.provider";
import { PrismaModule } from "../prisma/prisma.module";
import { QrCodeGeneratorProvider } from "./providers/qrCodeGenerator.provider";
import { ChatModule } from "../chat/chat.module";

@Module({
    imports: [PrismaModule, forwardRef(() => ChatModule)],
    controllers: [UserController],
    providers: [ UserService, EncoderProvider, SMTPProvider, QrCodeGeneratorProvider],
    exports: [UserService, EncoderProvider, QrCodeGeneratorProvider, ChatModule]
})

export class UserModule {

}