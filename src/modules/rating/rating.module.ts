import { Module, ModuleMetadata } from '@nestjs/common';
import { RatingService } from './rating.service';
import { RatingController } from './rating.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationModule } from '../notification/notification.module';

const metadata: ModuleMetadata = {
  imports: [PrismaModule, NotificationModule],
  controllers: [RatingController],
  providers: [RatingService],
  exports: [RatingService],
};

@Module(metadata)
export class RatingModule {}
