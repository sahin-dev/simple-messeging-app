import { Module } from '@nestjs/common';
import { PrivacyPolicyController } from './privacypolicy.controller';
import { PrivacyPolicyService } from './privacypolicy.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
    imports:[],
    controllers:[PrivacyPolicyController],
    providers:[PrivacyPolicyService,PrismaService]
})
export class PrivacyPolicyModule {}
