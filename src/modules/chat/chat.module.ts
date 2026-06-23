import { Module, OnModuleInit, forwardRef } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { SocketGateway } from './gateway/chat.gateway';
import { UserModule } from '../user/user.module';
import { PrismaModule } from '../prisma/prisma.module';
import { GroupChatModule } from '../group-chat/group-chat.module';
import { RatingModule } from '../rating/rating.module';
import { SocketRoomService } from './services/socket-room.service';
import { NotificationModule } from '../notification/notification.module';


@Module({
    imports:[forwardRef(() => UserModule), PrismaModule, GroupChatModule, RatingModule, NotificationModule],
    controllers:[ChatController],
    providers:[
      ChatService, 
      SocketGateway, 
      SocketRoomService,
      {
        provide: 'SOCKET_ROOM_SERVICE',
        useExisting: SocketRoomService,
      }
    ],
    exports:[ChatService, SocketGateway, SocketRoomService, 'SOCKET_ROOM_SERVICE']
})
export class ChatModule implements OnModuleInit{

    onModuleInit() {
        
    }
}
