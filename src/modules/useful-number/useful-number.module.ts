import { Module, OnModuleInit } from '@nestjs/common';
import { UsefulNumberController } from './useful-number.controller';
import { UsefulNumberService } from './useful-number.service';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  imports: [PrismaModule],
  controllers: [UsefulNumberController],
  providers: [UsefulNumberService],
  exports: [UsefulNumberService],
})
export class UsefulNumberModule implements OnModuleInit{

  constructor(private readonly prismaService: PrismaService) {}

  async onModuleInit() {
     await this.prismaService.$runCommandRaw({
      createIndexes: 'useful_numbers',
      indexes: [
        {
          key: {
            geolocation: '2dsphere',
          },
          name: 'geolocation_2dsphere',
        },
      ],
    });
    
  }
}
