import { Module } from "@nestjs/common";
import { BlacklistedwordController } from "./blacklistedword.controller";
import { BlacklistedwordService } from "./blacklistedword.service";
import { PrismaService } from "../prisma/prisma.service";
import { PrismaModule } from "../prisma/prisma.module";

@Module({
    imports: [PrismaModule],
    controllers: [BlacklistedwordController],
    providers: [BlacklistedwordService],
    exports: [BlacklistedwordService]
})
export class BlacklistedwordModule { }
