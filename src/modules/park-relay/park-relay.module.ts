import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationModule } from '../notification/notification.module';
import { ChatModule } from '../chat/chat.module';
import { ParkRelayController } from './park-relay.controller';
import { ParkRelayService } from './park-relay.service';

@Module({
  imports: [PrismaModule, NotificationModule, ChatModule],
  controllers: [ParkRelayController],
  providers: [ParkRelayService],
  exports: [ParkRelayService],
})
export class ParkRelayModule {}
