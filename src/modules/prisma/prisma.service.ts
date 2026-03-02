import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "generated/prisma/client";



@Injectable()
export class PrismaService extends PrismaClient  implements OnModuleInit, OnModuleDestroy{
    

    private readonly logger = new Logger(PrismaService.name)

    onModuleInit() {
        this.$connect().then(()=> {
            this.logger.log("Database connected successfully...")
        }).catch(err => {
            this.logger.log("Database connection failed...")
            this.logger.error(err)
        })
    }

    onModuleDestroy() {
        this.$disconnect()
    }
}