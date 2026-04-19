import { Module } from '@nestjs/common';
import { PresetMessageController } from './preset-message.controller';
import { PresetMessageService } from './preset-message.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PresetMessageController],
  providers: [PresetMessageService],
  exports: [PresetMessageService],
})
export class PresetMessageModule {}
