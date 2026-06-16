import { Injectable, UseFilters, UsePipes, ValidationPipe } from "@nestjs/common";
import { ConnectedSocket, MessageBody, OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit, SubscribeMessage, WebSocketGateway, WebSocketServer, WsException } from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { ChatService } from "../chat.service";
import { GroupChatService } from "src/modules/group-chat/group-chat.service";
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
import { CreateGroupChatRoomDto } from "src/modules/group-chat/dtos/create-group-chat-room.dto";
import { SendGroupMessageDto } from "src/modules/group-chat/dtos/send-group-message.dto";
import { UpdateGroupChatRoomDto } from "src/modules/group-chat/dtos/update-group-chat-room.dto";
import { AddGroupMembersDto } from "src/modules/group-chat/dtos/add-group-members.dto";
import { PaginationDto } from "src/modules/group-chat/dtos/pagination.dto";
import { SocketRoomService } from "../services/socket-room.service";


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

    private userTypingStates: Map<string, Set<string>> = new Map() // Track typing users per group

    constructor(
        private readonly chatService: ChatService,
        private readonly userService: UserService,
        private readonly groupChatService: GroupChatService,
        private readonly socketRoomService: SocketRoomService,
        // private readonly server: Server
    ) {}

    /**
     * Initialize gateway and set server on SocketRoomService
     */
    afterInit(server: Server) {
        this.socketRoomService.setServer(server);
    }

    /**
     * Generate Socket.IO room ID for a group chat
     * @param groupChatRoomId The ID of the group chat room
     * @returns Formatted room ID string
     */
    private generateGroupRoomId(groupChatRoomId: string | number): string {
        return `group-${groupChatRoomId}`
    }

    /**
     * Generate Socket.IO room ID for a user
     * @param userId The ID of the user
     * @returns Formatted room ID string
     */
    private generateUserRoomId(userId: string | number): string {
        return `user-${userId}`
    }

    handleDisconnect(client: Socket) {
        console.log(`client disconnected: ${client.id}`)

        const userId = client.data.userId

        if (userId) {
            console.log(`User ${userId} disconnected.`)
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
            // Join user to their personal room
            client.join(this.generateUserRoomId(userId))

            client.data.userId = userId

            client.emit(EMIT_EVENTS.SUCCESS, { message: "User Successfully Connected With Socket" })

        } catch (err:any) {
            console.log(err)
            throw new WsException({ message: err.message })

        }
    }

    


    @SubscribeMessage("greeting")
    handleMessage(@MessageBody() data: any, @ConnectedSocket() client: Socket) {

    }

    /**
     * INDIVIDUAL CHAT HANDLERS
     */

    @SubscribeMessage(SUBSCRIBED_EVENTS.MESSAGE)
    async handleChat(@MessageBody() data: SendMessageDto, @ConnectedSocket() client: Socket) {
        try {

            const userId = client.data.userId
            
            const chat = await this.chatService.createMessage(userId, data)

            // Send to receiver
            this.server.to(this.generateUserRoomId(data.receiver_id)).emit(EMIT_EVENTS.NEW_MESSAGE, { ...chat, is_mine: false })

            // Send confirmation to sender
            this.server.to(this.generateUserRoomId(userId)).emit(EMIT_EVENTS.MESSAGE_SENT, { ...chat, is_mine: true })
        } catch (err: any) {
            console.log(err)
            throw new WsException({ message: err.message })
        }

    }


    @SubscribeMessage(SUBSCRIBED_EVENTS.MESSAGE_RECEIVED)
    async handleMesssageDelivery(@MessageBody() acknowledgements: MessageAcknowledgementDto, @ConnectedSocket() client: Socket) {

        acknowledgements.messageIds.forEach(async (messageId) => {
            const chat = await this.chatService.acknowledgeMessageDelivery(messageId)
            // Notify sender that message was delivered
            this.server.to(this.generateUserRoomId(chat.sender_id)).emit(EMIT_EVENTS.MESSAGE_DELIVERED, chat)
        })
    }


    // File messages are sent via HTTP POST /chat/message/file
    // The socket events (new-message / message-sent) are emitted
    // from ChatService.sendFileMessage() using SocketRoomService.

    @SubscribeMessage(SUBSCRIBED_EVENTS.FETCH_CHAT_ROOMS)
    async getAllUserRooms(@MessageBody() getUserRoomsDto: GetUserRoomsDto, @ConnectedSocket() client: Socket) {
        const userId = client.data.userId

        const rooms = await this.chatService.getUserChatRooms(userId, getUserRoomsDto)
        console.log(rooms)
        const roomDto = plainToInstance(AllUserRoomsDto, rooms, {
            excludeExtraneousValues: true
        })

        this.server.to(this.generateUserRoomId(userId)).emit(EMIT_EVENTS.ALL_CHAT_ROOMS, {
            ...roomDto
        })
    }

    @SubscribeMessage(SUBSCRIBED_EVENTS.FETCH_MESSAGES)
    async getAllRoomMessages(@MessageBody() getAllMessageDto: GetAllMessagesDto, @ConnectedSocket() client: Socket) {
        const userId = client.data.userId

        console.log(getAllMessageDto)

        const messages = await this.chatService.getRoomMessages(userId, getAllMessageDto)

        const messageDto = plainToInstance(AllMessageDto, messages, {
            excludeExtraneousValues: true
        })

        this.server.to(this.generateUserRoomId(userId)).emit(EMIT_EVENTS.ALL_MESSAGES, {
            ...messageDto
        })
    }

    /**
     * GROUP CHAT HANDLERS
     */

    @SubscribeMessage(SUBSCRIBED_EVENTS.CREATE_GROUP_CHAT)
    async handleCreateGroupChat(@MessageBody() data: CreateGroupChatRoomDto, @ConnectedSocket() client: Socket) {
        try {
            const userId = client.data.userId

            const groupChat = await this.groupChatService.createGroupChatRoom(userId, data)

            // Join creator to group room
            const groupRoomId = this.generateGroupRoomId(groupChat.id)
            client.join(groupRoomId)

            // Notify all group members
            groupChat.members.forEach(member => {
                this.server.to(this.generateUserRoomId(member.user_id)).emit(EMIT_EVENTS.SUCCESS, {
                    message: `You've been added to group: ${groupChat.name}`,
                    groupChat
                })
            })

            client.emit(EMIT_EVENTS.SUCCESS, {
                message: "Group chat created successfully",
                groupChat
            })
        } catch (err: any) {
            console.log(err)
            throw new WsException({ message: err.message })
        }
    }

    @SubscribeMessage(SUBSCRIBED_EVENTS.SEND_GROUP_MESSAGE)
    async handleSendGroupMessage(@MessageBody() data: SendGroupMessageDto, @ConnectedSocket() client: Socket) {
        try {
            const userId = client.data.userId

            const message = await this.groupChatService.sendGroupMessage(userId, data)

            const groupRoomId = this.generateGroupRoomId(data.groupChatRoomId)

            // Broadcast to all group members except sender
            client.broadcast.to(groupRoomId).emit(EMIT_EVENTS.GROUP_NEW_MESSAGE, {
                ...message,
                groupChatRoomId: data.groupChatRoomId,
                is_mine: false
            })

            // Confirm to sender
            client.emit(EMIT_EVENTS.GROUP_MESSAGE_SENT, {
                ...message,
                is_mine: true
            })

            // Stop typing indicator
            this.userTypingStates.delete(`${data.groupChatRoomId}-${userId}`)
            this.server.to(groupRoomId).emit(EMIT_EVENTS.GROUP_USER_STOPPED_TYPING, {
                userId,
                groupChatRoomId: data.groupChatRoomId
            })
        } catch (err: any) {
            console.log(err)
            throw new WsException({ message: err.message })
        }
    }

    @SubscribeMessage(SUBSCRIBED_EVENTS.JOIN_GROUP_CHAT)
    async handleJoinGroupChat(@MessageBody() data: { groupChatRoomId: string }, @ConnectedSocket() client: Socket) {
        try {
            const userId = client.data.userId
            const groupRoomId = this.generateGroupRoomId(data.groupChatRoomId)

            client.join(groupRoomId)

            // Notify all members that user joined
            this.server.to(groupRoomId).emit(EMIT_EVENTS.SUCCESS, {
                message: `User ${userId} joined the group`,
                userId,
                groupChatRoomId: data.groupChatRoomId
            })

            client.emit(EMIT_EVENTS.SUCCESS, {
                message: "Successfully joined group chat"
            })
        } catch (err: any) {
            console.log(err)
            throw new WsException({ message: err.message })
        }
    }

    @SubscribeMessage(SUBSCRIBED_EVENTS.LEAVE_GROUP_CHAT)
    async handleLeaveGroupChat(@MessageBody() data: { groupChatRoomId: string }, @ConnectedSocket() client: Socket) {
        try {
            const userId = client.data.userId
            const groupRoomId = this.generateGroupRoomId(data.groupChatRoomId)

            // Call service to update database and handle admin reassignment if needed
            const result = await this.groupChatService.leaveGroup(data.groupChatRoomId, userId)

            // Remove user from socket room
            client.leave(groupRoomId)

            // Notify remaining members that user left
            this.server.to(groupRoomId).emit(EMIT_EVENTS.GROUP_MEMBER_REMOVED, {
                message: `User ${userId} left the group`,
                userId,
                groupChatRoomId: data.groupChatRoomId
            })

            client.emit(EMIT_EVENTS.SUCCESS, {
                message: result.message || "Successfully left group chat"
            })
        } catch (err: any) {
            console.log(err)
            throw new WsException({ message: err.message })
        }
    }

    @SubscribeMessage(SUBSCRIBED_EVENTS.FETCH_GROUP_CHAT_ROOMS)
    async handleFetchGroupChatRooms(@MessageBody() pagination: PaginationDto, @ConnectedSocket() client: Socket) {
        try {
            const userId = client.data.userId

            const response = await this.groupChatService.getGroupChatRooms(userId, pagination)

            // Join all group rooms
            response.rooms.forEach(room => {
                const groupRoomId = this.generateGroupRoomId(room.id)
                client.join(groupRoomId)
            })

            this.server.to(this.generateUserRoomId(userId)).emit(EMIT_EVENTS.GROUP_CHAT_ROOMS, response)
        } catch (err: any) {
            console.log(err)
            throw new WsException({ message: err.message })
        }
    }

    @SubscribeMessage(SUBSCRIBED_EVENTS.FETCH_GROUP_MESSAGES)
    async handleFetchGroupMessages(
        @MessageBody() data: { groupChatRoomId: string; pagination: PaginationDto },
        @ConnectedSocket() client: Socket
    ) {
        try {
            const userId = client.data.userId

            const response = await this.groupChatService.getGroupChatMessages(
                data.groupChatRoomId,
                userId,
                data.pagination
            )

            this.server.to(this.generateUserRoomId(userId)).emit(EMIT_EVENTS.GROUP_MESSAGES, response)
        } catch (err: any) {
            console.log(err)
            throw new WsException({ message: err.message })
        }
    }

    @SubscribeMessage(SUBSCRIBED_EVENTS.ADD_GROUP_MEMBER)
    async handleAddGroupMember(
        @MessageBody() data: { groupChatRoomId: string; newMemberId: string },
        @ConnectedSocket() client: Socket
    ) {
        try {
            const userId = client.data.userId

            const newMember = await this.groupChatService.addGroupMember(
                data.groupChatRoomId,
                userId,
                data.newMemberId
            )

            const groupRoomId = this.generateGroupRoomId(data.groupChatRoomId)

            // Notify all group members
            this.server.to(groupRoomId).emit(EMIT_EVENTS.GROUP_MEMBER_ADDED, {
                message: `${newMember.user.nick_name} was added to the group`,
                newMember,
                groupChatRoomId: data.groupChatRoomId
            })

            // Notify the new member
            this.server.to(this.generateUserRoomId(data.newMemberId)).emit(EMIT_EVENTS.SUCCESS, {
                message: "You've been added to a group",
                groupChatRoomId: data.groupChatRoomId,
                newMember
            })

            client.emit(EMIT_EVENTS.SUCCESS, {
                message: "Member added successfully",
                newMember
            })
        } catch (err: any) {
            console.log(err)
            throw new WsException({ message: err.message })
        }
    }

    @SubscribeMessage(SUBSCRIBED_EVENTS.ADD_GROUP_MEMBERS)
    async handleAddGroupMembers(
        @MessageBody() data: { groupChatRoomId: string; memberIds: string[] },
        @ConnectedSocket() client: Socket
    ) {
        try {
            const userId = client.data.userId

            const result = await this.groupChatService.addGroupMembers(
                data.groupChatRoomId,
                userId,
                data.memberIds
            )

            const groupRoomId = this.generateGroupRoomId(data.groupChatRoomId)

            // Notify all group members about the newly added members
            result.members.forEach((newMember) => {
                this.server.to(groupRoomId).emit(EMIT_EVENTS.GROUP_MEMBERS_ADDED, {
                    message: `${newMember.user.nick_name} was added to the group`,
                    newMember,
                    groupChatRoomId: data.groupChatRoomId,
                    addedCount: result.addedCount,
                })

                // Notify each new member individually
                this.server.to(this.generateUserRoomId(newMember.user_id)).emit(EMIT_EVENTS.SUCCESS, {
                    message: "You've been added to a group",
                    groupChatRoomId: data.groupChatRoomId,
                    newMember
                })
            })

            client.emit(EMIT_EVENTS.SUCCESS, {
                message: `${result.addedCount} member(s) added successfully`,
                addedCount: result.addedCount,
                alreadyMemberCount: result.alreadyMemberCount,
                members: result.members
            })
        } catch (err: any) {
            console.log(err)
            throw new WsException({ message: err.message })
        }
    }

    @SubscribeMessage(SUBSCRIBED_EVENTS.REMOVE_GROUP_MEMBER)
    async handleRemoveGroupMember(
        @MessageBody() data: { groupChatRoomId: string; memberId: string },
        @ConnectedSocket() client: Socket
    ) {
        try {
            const userId = client.data.userId

            await this.groupChatService.removeGroupMember(
                data.groupChatRoomId,
                userId,
                data.memberId
            )

            const groupRoomId = this.generateGroupRoomId(data.groupChatRoomId)
            const memberUserRoomId = this.generateUserRoomId(data.memberId)

            // Notify all group members that a member was removed
            this.server.to(groupRoomId).emit(EMIT_EVENTS.GROUP_MEMBER_REMOVED, {
                message: `Member was removed from the group`,
                memberId: data.memberId,
                removedBy: userId,
                groupChatRoomId: data.groupChatRoomId
            })

            // Notify the removed member and remove them from the socket room
            this.server.to(memberUserRoomId).emit(EMIT_EVENTS.GROUP_MEMBER_REMOVED, {
                message: "You've been removed from a group",
                groupChatRoomId: data.groupChatRoomId,
                memberId: data.memberId
            })

            // Find and remove the specific user's sockets from the group room
            const socketsInRoom = await this.server.in(groupRoomId).fetchSockets()
            for (const socket of socketsInRoom) {
                if (socket.data.userId === data.memberId) {
                    socket.leave(groupRoomId)
                }
            }

            client.emit(EMIT_EVENTS.SUCCESS, {
                message: "Member removed successfully"
            })
        } catch (err: any) {
            console.log(err)
            throw new WsException({ message: err.message })
        }
    }

    @SubscribeMessage(SUBSCRIBED_EVENTS.UPDATE_GROUP_CHAT)
    async handleUpdateGroupChat(
        @MessageBody() data: { groupChatRoomId: string; updateData: UpdateGroupChatRoomDto },
        @ConnectedSocket() client: Socket
    ) {
        try {
            const userId = client.data.userId

            const updatedGroup = await this.groupChatService.updateGroupChatRoom(
                data.groupChatRoomId,
                userId,
                data.updateData
            )

            const groupRoomId = this.generateGroupRoomId(data.groupChatRoomId)

            // Notify all group members of the update
            this.server.to(groupRoomId).emit(EMIT_EVENTS.GROUP_UPDATED, {
                message: "Group information updated",
                updatedGroup,
                updatedBy: userId,
                groupChatRoomId: data.groupChatRoomId
            })

            client.emit(EMIT_EVENTS.SUCCESS, {
                message: "Group updated successfully",
                updatedGroup
            })
        } catch (err: any) {
            console.log(err)
            throw new WsException({ message: err.message })
        }
    }

    @SubscribeMessage(SUBSCRIBED_EVENTS.GROUP_TYPING)
    async handleGroupTyping(
        @MessageBody() data: { groupChatRoomId: string },
        @ConnectedSocket() client: Socket
    ) {
        try {
            const userId = client.data.userId
            const typingKey = `${data.groupChatRoomId}-${userId}`

            // Add user to typing set
            if (!this.userTypingStates.has(data.groupChatRoomId)) {
                this.userTypingStates.set(data.groupChatRoomId, new Set())
            }
            this.userTypingStates.get(data.groupChatRoomId)!.add(userId)

            const groupRoomId = this.generateGroupRoomId(data.groupChatRoomId)

            // Notify all group members that this user is typing
            this.server.to(groupRoomId).emit(EMIT_EVENTS.GROUP_USER_TYPING, {
                userId,
                groupChatRoomId: data.groupChatRoomId
            })
        } catch (err: any) {
            console.log(err)
            throw new WsException({ message: err.message })
        }
    }

    @SubscribeMessage(SUBSCRIBED_EVENTS.GROUP_STOP_TYPING)
    async handleGroupStopTyping(
        @MessageBody() data: { groupChatRoomId: string },
        @ConnectedSocket() client: Socket
    ) {
        try {
            const userId = client.data.userId

            // Remove user from typing set
            if (this.userTypingStates.has(data.groupChatRoomId)) {
                this.userTypingStates.get(data.groupChatRoomId)!.delete(userId)
            }

            const groupRoomId = this.generateGroupRoomId(data.groupChatRoomId)

            // Notify all group members that this user stopped typing
            this.server.to(groupRoomId).emit(EMIT_EVENTS.GROUP_USER_STOPPED_TYPING, {
                userId,
                groupChatRoomId: data.groupChatRoomId
            })
        } catch (err: any) {
            console.log(err)
            throw new WsException({ message: err.message })
        }
    }

}