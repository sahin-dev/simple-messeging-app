import { Module } from "@nestjs/common";
import { HelpSupportController } from "./help-support.controller";
import { HelpSupportService } from "./help-support.service";
import { PrismaModule } from "../prisma/prisma.module";
import { SMTPProvider } from "src/common/providres/smtp.provider";

@Module({
    imports: [PrismaModule],
    controllers: [HelpSupportController],
    providers: [HelpSupportService, SMTPProvider],
    exports: [HelpSupportService],
})
export class HelpSupportModule {}
