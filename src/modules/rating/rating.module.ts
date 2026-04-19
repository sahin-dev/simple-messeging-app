import { Module, ModuleMetadata } from '@nestjs/common';
import { RatingService } from './rating.service';
import { RatingController } from './rating.controller';
import { PrismaModule } from '../prisma/prisma.module';

const metadata: ModuleMetadata = {
  imports: [PrismaModule],
  controllers: [RatingController],
  providers: [RatingService],
  exports: [RatingService],
};

@Module(metadata)
export class RatingModule {}
