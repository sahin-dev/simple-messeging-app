import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { FireBaseClient } from './providers/firebase.provider';
import { NotificationEventService } from './services/notification-event.service';
import { NotificationPreferenceService } from './services/notification-preference.service';
import { NotificationDispatcherService } from './services/notification-dispatcher.service';
import { GeolocationService } from '../../common/services/geolocation.service';


@Module({
  imports: [PrismaModule],
  controllers: [NotificationController],
  providers: [
    NotificationService,
    NotificationEventService,
    NotificationPreferenceService,
    NotificationDispatcherService,
    GeolocationService,
    FireBaseClient
  ],
  exports: [
    NotificationService,
    NotificationEventService,
    NotificationPreferenceService,
    NotificationDispatcherService,
    GeolocationService,
  ],
})
export class NotificationModule {}
