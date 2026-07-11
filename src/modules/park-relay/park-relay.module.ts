import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationModule } from '../notification/notification.module';
import { ParkRelayController } from './park-relay.controller';
import { ParkRelayService } from './park-relay.service';

@Module({
  imports: [PrismaModule, NotificationModule],
  controllers: [ParkRelayController],
  providers: [ParkRelayService],
  exports: [ParkRelayService],
})
export class ParkRelayModule {}
