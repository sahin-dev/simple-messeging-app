import { Module } from '@nestjs/common';
import { UserDocumentController } from './user-document.controller';
import { UserDocumentService } from './services/user-document.service';
import { DocumentExpiryCheckService } from './services/document-expiry-check.service';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [
    PrismaModule,
    NotificationModule,
  ],
  controllers: [UserDocumentController],
  providers: [
    UserDocumentService,
    DocumentExpiryCheckService,
  ],
  exports: [
    UserDocumentService,
    DocumentExpiryCheckService,
  ],
})
export class UserDocumentModule {}
