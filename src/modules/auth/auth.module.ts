import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { UserService } from "../user/user.service";
import { EncoderProvider } from "src/common/providres/encoder.provider";
import { PrismaService } from "../prisma/prisma.service";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { SMTPProvider } from "src/common/providres/smtp.provider";
import type { jwtConfig } from "src/config/jwt.config";
import { ConfigType } from "@nestjs/config";
import jwtConfiguration from "src/config/jwt.config";
import { JwtGuard } from "./guards/jwt.guard";
import { APP_GUARD } from "@nestjs/core";
import { RolesGuard } from "src/common/guards/roles.guards";
import { PrismaModule } from "../prisma/prisma.module";
import { UserModule } from "../user/user.module";
import { RatingModule } from "../rating/rating.module";
import { UserDocumentModule } from "../user-document/user-document.module";
@Module({
    imports: [JwtModule.registerAsync({
        global: true,
        inject: [jwtConfiguration.KEY],
        useFactory: (jwtConfiguration: ConfigType<typeof jwtConfig>) => ({
            secret: jwtConfiguration.jwt_secret,
            signOptions: { expiresIn: (jwtConfiguration.expires_in as any) || '90d' }
        }),
    }), PrismaModule, UserModule, RatingModule, UserDocumentModule],
    controllers: [AuthController],
    providers: [AuthService, EncoderProvider, SMTPProvider,
        { provide: APP_GUARD, useClass: JwtGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
    ],
})
export class AuthModule { }
