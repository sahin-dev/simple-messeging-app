import { forwardRef, Inject, Injectable, UseFilters, UsePipes, ValidationPipe } from "@nestjs/common";
import { ConnectedSocket, MessageBody, OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit, SubscribeMessage, WebSocketGateway, WebSocketServer, WsException } from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { ChatService } from "../chat.service";
import { EMIT_EVENTS, SUBSCRIBED_EVENTS } from "../enums/events.enum";
import { SendMessageDto } from "../dtos/send-message.dto";
import { UserService } from "src/modules/user/user.service";
import { plainToInstance } from "class-transformer";
import { AllMessageDto } from "../dtos/all-message.dto";
import { GetAllMessagesDto } from "../dtos/get-all-messages.dto";
import { GetUserRoomsDto } from "../dtos/get-user-rooms.dto";
import { AllUserRoomsDto } from "../dtos/all-user-rooms.dto";
import { MessageAcknowledgementDto } from "../dtos/message-acknowledgement.dto";
import { WsExceptionsFilter } from "src/common/exceptions/WsExceptionHandler";



@WebSocketGateway({
    cors: {
        origin: "http://10.10.20.44:3000"
    }
})
@UsePipes(
    new ValidationPipe({
        transform: true,
        whitelist: true,
    }),
)
@UseFilters(WsExceptionsFilter)
@Injectable()
export class SocketGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {

    @WebSocketServer()
    server: Server

    private usersSocket: Map<string, string>

    constructor(private readonly chatService: ChatService,private readonly userService: UserService) {
        this.usersSocket = new Map<string, string>()
    }

    handleDisconnect(client: Socket) {
        console.log(`client disconnected: ${client.id}`)

        // Find the userId associated with the disconnected socket ID
        // Note: client.data.userId is the safest way to get the userId here
        const userId = client.data.userId

        if (userId) {
            // Remove the userId and its old client.id from the map
            this.usersSocket.delete(userId)
            console.log(`User ${userId} removed from usersSocket map.`)
        }
    }


    async handleConnection(client: Socket, ...args: any[]) {
        console.log(`client connected: ${client.id}`)

        try {
            const userId = client.handshake.query.userId as string
            const user = await this.userService.findUserById(userId)

            if (!user) {

                throw new Error("use not found")
            }
            // Store the userId and its associated client.id
            this.usersSocket.set(userId, client.id)

            client.data.userId = userId

            client.emit(EMIT_EVENTS.SUCCESS, { message: "User Successfully Connected With Socket" })

        } catch (err:any) {
            console.log(err)
            throw new WsException({ message: err.message })

        }
        // client.join(client.id)

    }

    afterInit(server: any) {
        console.log("Websocket server initialized")
    }


    @SubscribeMessage("greeting")
    handleMessage(@MessageBody() data: any, @ConnectedSocket() client: Socket) {


    }

    /**
     * 
     * @param data 
     * @param client 
     */

    @SubscribeMessage(SUBSCRIBED_EVENTS.MESSAGE)
    async handleChat(@MessageBody() data: SendMessageDto, @ConnectedSocket() client: Socket) {
        try {

            const userId = client.data.userId

            console.log(data)

            const chat = await this.chatService.createMessage(userId, data)

            const receiverRoomId = this.usersSocket.get(data.receiver_id.toString())
            const sender = this.usersSocket.get(userId.toString())

            if (receiverRoomId) {
                this.server.to(receiverRoomId).emit(EMIT_EVENTS.NEW_MESSAGE, { ...chat, is_mine: false })
            }

            if (sender) {
                this.server.to(sender).emit(EMIT_EVENTS.MESSAGE_SENT, { ...chat, is_mine: true })
            }
        } catch (err: any) {
            // client.emit("message-error", { message: err.message })
            console.log(err)
            throw new WsException({ message: err.message })
        }

    }


    @SubscribeMessage(SUBSCRIBED_EVENTS.MESSAGE_RECEIVED)
    async handleMesssageDelivery(@MessageBody() acknowledgements: MessageAcknowledgementDto, @ConnectedSocket() client: Socket) {

        acknowledgements.messageIds.forEach(async (messageId) => {
            const chat = await this.chatService.acknowledgeMessageDelivery(messageId)
            const senderSocketId = this.usersSocket.get(chat.sender_id)

            if (senderSocketId) {
                this.server.to(senderSocketId).emit(EMIT_EVENTS.MESSAGE_DELIVERED, chat)
            }
        })
    }

    /**
     * 
     * @param receiverId 
     * @param chat 
     */


    @SubscribeMessage(SUBSCRIBED_EVENTS.SEND_FILE)
    async handleFile(receiverId: string, chat: any) {


        const socketRoomId = this.usersSocket.get(receiverId)

        if (socketRoomId) {
            this.server.to(socketRoomId).emit(EMIT_EVENTS.NEW_MESSAGE, chat)
        }
    }

    /**
     * 
     * @param data 
     * @param client 
     */

    @SubscribeMessage(SUBSCRIBED_EVENTS.FETCH_CHAT_ROOMS)
    async getAllUserRooms(@MessageBody() getUserRoomsDto: GetUserRoomsDto, @ConnectedSocket() client: Socket) {
        const userId = client.data.userId

        const rooms = await this.chatService.getUserChatRooms(userId, getUserRoomsDto)
        console.log(rooms)
        const roomDto = plainToInstance(AllUserRoomsDto, rooms, {
            excludeExtraneousValues: true
        })

        const socketRoomId = this.usersSocket.get(userId)

        console.log(socketRoomId)

        if (socketRoomId) {
            this.server.to(socketRoomId).emit(EMIT_EVENTS.ALL_CHAT_ROOMS, {
                ...roomDto
            })
        }
    }

    @SubscribeMessage(SUBSCRIBED_EVENTS.FETCH_MESSAGES)
    async getAllRoomMessages(@MessageBody() getAllMessageDto: GetAllMessagesDto, @ConnectedSocket() client: Socket) {
        const userId = client.data.userId

        console.log(getAllMessageDto)

        const messages = await this.chatService.getRoomMessages(userId, getAllMessageDto)

        const socketRoomId = this.usersSocket.get(userId)

        const messageDto = plainToInstance(AllMessageDto, messages, {
            excludeExtraneousValues: true
        })

        if (socketRoomId) {
            this.server.to(socketRoomId).emit(EMIT_EVENTS.ALL_MESSAGES, {
                ...messageDto
            })
        }
    }

}