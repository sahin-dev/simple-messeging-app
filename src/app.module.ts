import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './modules/prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { ChatModule } from './modules/chat/chat.module';

import jwtConfig from './config/jwt.config';
import { PrivacyPolicyModule } from './modules/privacy_policy/privacy_policy.module';
import { NotificationModule } from './modules/notification/notification.module';
import { BlacklistedwordModule } from './modules/blacklistedword/blacklistedword.module';
import mailerConfig from './config/mailer.config';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [jwtConfig, mailerConfig] }),
    PrismaModule,
    AuthModule,
    UserModule,
    ChatModule,
    PrivacyPolicyModule,
    NotificationModule,
    BlacklistedwordModule
  ],
  controllers: [AppController],
  providers: [AppService
  ],
})
export class AppModule { }
