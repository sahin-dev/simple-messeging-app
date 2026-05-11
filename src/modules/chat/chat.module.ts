import { Module, OnModuleInit, forwardRef } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { SocketGateway } from './gateway/chat.gateway';
import { UserModule } from '../user/user.module';
import { PrismaModule } from '../prisma/prisma.module';
import { GroupChatModule } from '../group-chat/group-chat.module';
import { RatingModule } from '../rating/rating.module';


@Module({
    imports:[forwardRef(() => UserModule), PrismaModule, GroupChatModule, RatingModule],
    controllers:[ChatController],
    providers:[ChatService, SocketGateway],
    exports:[ChatService, SocketGateway]
})
export class ChatModule implements OnModuleInit{

    onModuleInit() {
        
    }
}
