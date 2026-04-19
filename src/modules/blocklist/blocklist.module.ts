import { Module } from '@nestjs/common';
import { BlocklistController } from './blocklist.controller';
import { BlocklistService } from './blocklist.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [BlocklistController],
  providers: [BlocklistService],
  exports: [BlocklistService],
})
export class BlocklistModule {}
