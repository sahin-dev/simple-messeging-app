import {  Module, OnModuleInit } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { PrismaService } from '../prisma/prisma.service';
import { SocketGateway } from './gateway/chat.gateway';
import { UserModule } from '../user/user.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
    imports:[UserModule, PrismaModule],
    controllers:[ChatController],
    providers:[ChatService, SocketGateway],
    exports:[ChatService, SocketGateway]
})
export class ChatModule implements OnModuleInit{

    onModuleInit() {
        
    }
}
