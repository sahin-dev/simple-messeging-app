import { Module } from '@nestjs/common';
import { UsefulNumberController } from './useful-number.controller';
import { UsefulNumberService } from './useful-number.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [UsefulNumberController],
  providers: [UsefulNumberService],
  exports: [UsefulNumberService],
})
export class UsefulNumberModule {}
