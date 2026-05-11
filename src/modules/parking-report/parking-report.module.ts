import { Module } from '@nestjs/common';
import { ParkingReportController } from './parking-report.controller';
import { ParkingReportService } from './parking-report.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ParkingReportController],
  providers: [ParkingReportService],
  exports: [ParkingReportService],
})
export class ParkingReportModule {}
