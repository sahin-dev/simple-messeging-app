import { Module } from '@nestjs/common';
import { PrivacyPolicyController } from './privacypolicy.controller';
import { PrivacyPolicyService } from './privacypolicy.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
    imports:[PrismaModule],
    controllers:[PrivacyPolicyController],
    providers:[PrivacyPolicyService]
})
export class PrivacyPolicyModule {}
