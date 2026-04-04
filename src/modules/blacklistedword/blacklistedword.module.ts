import { Module } from "@nestjs/common";
import { BlacklistedwordController } from "./blacklistedword.controller";
import { BlacklistedwordService } from "./blacklistedword.service";
import { PrismaService } from "../prisma/prisma.service";

@Module({
    imports: [],
    controllers: [BlacklistedwordController],
    providers: [BlacklistedwordService, PrismaService],
    exports: [BlacklistedwordService]
})
export class BlacklistedwordModule { }
