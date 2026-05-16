import { Module } from '@nestjs/common';
import { ParkingReportController } from './parking-report.controller';
import { ParkingReportService } from './parking-report.service';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [PrismaModule, NotificationModule],
  controllers: [ParkingReportController],
  providers: [ParkingReportService],
  exports: [ParkingReportService],
})
export class ParkingReportModule {}
