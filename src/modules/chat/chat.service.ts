import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SendMessageDto } from "./dtos/send-message.dto";
import { GetAllMessagesDto } from "./dtos/get-all-messages.dto";
import { GetUserRoomsDto } from "./dtos/get-user-rooms.dto";
import { SocketGateway } from "./gateway/chat.gateway";

@Injectable()
export class ChatService {

    constructor(
        private readonly prismaService: PrismaService,
    ) { }

    /**
     * Create a new message
     * @param userId 
     * @param sendMessageDto 
     * @returns 
     */
    async createMessage(userId: string, sendMessageDto: SendMessageDto) {

        if (userId === sendMessageDto.receiver_id) {
            throw new Error("You can not message yourself!")
        }

        const receiverUser = await this.prismaService.user.findUnique({
            where: { id: sendMessageDto.receiver_id }
        });


        if (!receiverUser) {
            throw new Error("Receiver user not found");
        }

        const isBlockExist = await this.prismaService.blockList.findFirst({where:{
            OR:[
                {blocked_user_id:userId, user_id:sendMessageDto.receiver_id},
                {blocked_user_id:sendMessageDto.receiver_id, user_id:userId}
            ]
        }})

        if(isBlockExist){
            throw new BadRequestException("You can not messaged this account")
        }

        const room = await this.createChatRoomIfNotExists(userId, sendMessageDto.receiver_id);

        const createdChat = await this.prismaService.chat.create({
            data: {
                chatRoom_id: room.id,
                sender_id: userId,
                receiver_id: sendMessageDto.receiver_id,
                message: sendMessageDto.message,
            },
            include: {
                sender: {
                    select: {
                        id: true,
                        nick_name: true,
                        avatar: true
                    }
                },
                receiver: {
                    select: {
                        id: true,
                        nick_name: true,
                        avatar: true
                    }
                }
            },
        });

        await this.prismaService.chatRoom.update({
            where: { id: room.id },
            data: {
                updatedAt: new Date()
            }
        });

        return createdChat
    }

    /**
     * Create chat room if it doesn't exist
     * @param userId 
     * @param receiverId 
     * @returns 
     */
    private async createChatRoomIfNotExists(userId: string, receiverId: string) {
        // Ensure consistent ordering to avoid duplicate rooms
        const [user1_id, user2_id] = [userId, receiverId].sort();

        const existingRoom = await this.prismaService.chatRoom.findFirst({
            where: {
                OR: [{ user1_id: user1_id, user2_id: user2_id }, { user1_id: user2_id, user2_id: user1_id }],
            }
        });

        if (existingRoom) {
            return existingRoom;
        }

        const newRoom = await this.prismaService.chatRoom.create({
            data: {
                user1_id,
                user2_id
            }
        });

        return newRoom;
    }

    async getChatRoomIfExist(userId: string, receiverId: string) {
        const [user1_id, user2_id] = [userId, receiverId].sort();

        const existingRoom = await this.prismaService.chatRoom.findFirst({
            where: {
                OR: [{ user1_id: user1_id, user2_id: user2_id }, { user1_id: user2_id, user2_id: user1_id }],
            }
        });

        if (existingRoom) {
            return existingRoom;
        }

    }

    /**
     * Get user's chat rooms
     * @param userId 
     * @param getUserRoomsDto 
     * @returns 
     */
    async getUserChatRooms(userId: string, getUserRoomsDto: GetUserRoomsDto) {
        const skip = (getUserRoomsDto.page - 1) * getUserRoomsDto.limit;

        console.log("User id", userId)
        const [rooms, total] = await Promise.all([
            this.prismaService.chatRoom.findMany({
                where: {
                    OR: [
                        { user1_id: userId },
                        { user2_id: userId }
                    ]
                },
                include: {
                    user1: {
                        select: {
                            id: true,
                            nick_name: true,
                            licence_id: true,
                            avatar: true,
                        },
                    
                    },
                    user2: {
                        select: {
                            id: true,
                            nick_name: true,
                            licence_id: true,
                            avatar: true,
                        }
                    },
                    chats: {
                        orderBy: { createdAt: "desc" },
                        take: 1,
                        include: {
                            sender: {
                                select: {
                                    id: true,
                                    nick_name: true
                                }
                            }
                        }
                    },
                    _count: {
                        select: {
                            chats: {
                                where: {
                                    is_read: false,
                                    receiver_id: userId
                                }
                            }
                        }
                    }
                },
                orderBy: {
                    updatedAt: "desc"
                },
                skip,
                take: getUserRoomsDto.limit
            }),
            this.prismaService.chatRoom.count({
                where: {
                    OR: [
                        { user1_id: userId },
                        { user2_id: userId }
                    ]
                }
            })
        ]);

        const mappedRoom = rooms.map(async ({ user1, user2, _count, chats, ...room }) => {
            // Get the other user (not the current user)
            const otherUser = room.user1_id === userId ? user2 : user1;
            const latestChat = chats[0];
            const is_latest_message_mine = latestChat?.sender_id === userId;
            const isBlockedByMe = await this.prismaService.blockList.findFirst({where:{user_id:userId, blocked_user_id:otherUser.id}})
            const isBlockedMe = await this.prismaService.blockList.findFirst({where:{user_id:otherUser.id, blocked_user_id:userId}})
            

            
            return {
                ...room,
                otherUser,
                latest_message: latestChat ? {
                    ...latestChat,
                    is_mine: is_latest_message_mine
                } : null,
                unread_count: _count.chats,
                isBlockedByMe:isBlockedByMe? true:false,
                isBlockedMe:isBlockedMe ? true:false
            };
        });

        return { rooms: await Promise.all(mappedRoom), total: total };
    }

    /**
     * Get messages in a chat room
     * @param userId 
     * @param getAllMessageDto 
     * @returns 
     */
    async getRoomMessages(userId: string, getAllMessageDto: GetAllMessagesDto) {
        const skip = (getAllMessageDto.page - 1) * getAllMessageDto.limit;

        console.log(getAllMessageDto)

        const [messages, total] = await Promise.all([
            this.prismaService.chat.findMany({
                where: { chatRoom_id: getAllMessageDto.roomId },
                include: {
                    sender: {
                        select: {
                            id: true,
                            nick_name: true,
                            avatar: true
                        }
                    },
                    receiver: {
                        select: {
                            id: true,
                            nick_name: true,
                            avatar: true
                        }
                    }
                },
                skip,
                take: getAllMessageDto.limit,
                orderBy: { createdAt: "desc" }
            }),
            this.prismaService.chat.count({
                where: { chatRoom_id: getAllMessageDto.roomId }
            })
        ]);

        // Mark messages as read
        await this.prismaService.chat.updateMany({
            where: {
                chatRoom_id: getAllMessageDto.roomId,
                receiver_id: userId,
                is_read: false
            },
            data: { is_read: true }
        });

        const mappedMessages = messages.map(message => {
            const is_mine = message.sender_id === userId;
            return { ...message, is_mine };
        });

        // const reversedMessages = mappedMessages.reverse();
        return { messages: mappedMessages, total };
    }

    /**
     * Acknowledge message delivery
     * @param messageId 
     * @returns 
     */
    async acknowledgeMessageDelivery(messageId: string) {
        const chat = await this.prismaService.chat.update({
            where: { id: messageId },
            data: { is_delivered: true, is_read: true }
        });

        return chat;
    }

    as
}