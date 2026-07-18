import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './modules/prisma/prisma.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { ChatModule } from './modules/chat/chat.module';
import { GroupChatModule } from './modules/group-chat/group-chat.module';
import { PresetMessageModule } from './modules/preset-message/preset-message.module';
import { UsefulNumberModule } from './modules/useful-number/useful-number.module';
import { BlocklistModule } from './modules/blocklist/blocklist.module';
import { PointModule } from './modules/point/point.module';
import { RatingModule } from './modules/rating/rating.module';
import { ParkingReportModule } from './modules/parking-report/parking-report.module';
import { UserDocumentModule } from './modules/user-document/user-document.module';
import { ParkRelayModule } from './modules/park-relay/park-relay.module';

import jwtConfig from './config/jwt.config';
import { PrivacyPolicyModule } from './modules/privacy_policy/privacy_policy.module';
import { NotificationModule } from './modules/notification/notification.module';
import { BlacklistedwordModule } from './modules/blacklistedword/blacklistedword.module';
import mailerConfig from './config/mailer.config';
import firebaseConfig from './config/firebase.config';
import appleConfig from './config/apple.config';
import { FaqModule } from './modules/faq/faq.module';

import { HelpSupportModule } from './modules/help-support/help-support.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [jwtConfig, mailerConfig, firebaseConfig, appleConfig] }),
    PrismaModule,
    AuthModule,
    UserModule,
    ChatModule,
    GroupChatModule,
    PresetMessageModule,
    UsefulNumberModule,
    BlocklistModule,
    PointModule,
    RatingModule,
    ParkingReportModule,
    PrivacyPolicyModule,
    NotificationModule,
    BlacklistedwordModule,
    UserDocumentModule,
    FaqModule,
    HelpSupportModule,
    ParkRelayModule,
  ],
  controllers: [AppController],
  providers: [AppService, ConfigService],
  exports:[ConfigService]
})
export class AppModule { }
