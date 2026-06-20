import { BadRequestException, Injectable, Inject, Optional, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SendMessageDto } from "./dtos/send-message.dto";
import { GetAllMessagesDto } from "./dtos/get-all-messages.dto";
import { GetUserRoomsDto } from "./dtos/get-user-rooms.dto";
import { SocketGateway } from "./gateway/chat.gateway";
import { RatingService } from "../rating/rating.service";
import { SendFileDto } from "./dtos/send-file.dto";
import { MessageType } from "generated/prisma/enums";

@Injectable()
export class ChatService {

    constructor(
        private readonly prismaService: PrismaService,
        private readonly ratingService: RatingService,
        @Optional()
        @Inject("SOCKET_ROOM_SERVICE")
        private readonly socketRoomService?: any,
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
     * Send a file message in a chat room
     * @param userId 
     * @param sendFileDto 
     * @param file 
     * @returns 
     */
    async sendFileMessage(userId: string, sendFileDto: SendFileDto, file: Express.Multer.File) {
        if (!file) {
            throw new BadRequestException("File is required");
        }

        if (userId === sendFileDto.receiver_id) {
            throw new BadRequestException("You can not message yourself!");
        }

        const receiverUser = await this.prismaService.user.findUnique({
            where: { id: sendFileDto.receiver_id }
        });

        if (!receiverUser) {
            throw new BadRequestException("Receiver user not found");
        }

        const isBlockExist = await this.prismaService.blockList.findFirst({
            where: {
                OR: [
                    { blocked_user_id: userId, user_id: sendFileDto.receiver_id },
                    { blocked_user_id: sendFileDto.receiver_id, user_id: userId }
                ]
            }
        });

        if (isBlockExist) {
            throw new BadRequestException("You can not message this account");
        }

        const room = await this.createChatRoomIfNotExists(userId, sendFileDto.receiver_id);

        const createdChat = await this.prismaService.chat.create({
            data: {
                chatRoom_id: room.id,
                sender_id: userId,
                receiver_id: sendFileDto.receiver_id,
                message: sendFileDto.message || file.originalname,
                type: MessageType.FILE,
                file_url: `/uploads/chats/${file.filename}`,
                file_name: file.originalname,
                file_size: file.size,
                file_mime_type: file.mimetype,
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

        // Emit live event via websocket
        if (this.socketRoomService && this.socketRoomService.server) {
            const server = this.socketRoomService.server;
            const receiverRoom = `user-${sendFileDto.receiver_id}`;
            const senderRoom = `user-${userId}`;

            // Send to receiver
            server.to(receiverRoom).emit("new-message", { ...createdChat, is_mine: false });
            // Send confirmation to sender
            server.to(senderRoom).emit("message-sent", { ...createdChat, is_mine: true });
        }

        return createdChat;
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
     * Get user's chat rooms (both one-to-one and group)
     * @param userId 
     * @param getUserRoomsDto 
     * @returns 
     */
    async getUserChatRooms(userId: string, getUserRoomsDto: GetUserRoomsDto) {
        const skip = (getUserRoomsDto.page - 1) * getUserRoomsDto.limit;

        console.log("User id", userId)

        // Fetch one-to-one chat rooms and group chat rooms in parallel
        const [oneToOneData, groupData] = await Promise.all([
            // One-to-one rooms
            Promise.all([
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
                    }
                }),
                this.prismaService.chatRoom.count({
                    where: {
                        OR: [
                            { user1_id: userId },
                            { user2_id: userId }
                        ]
                    }
                })
            ]),
            // Group chat rooms
            Promise.all([
                this.prismaService.groupChatRoom.findMany({
                    where: {
                        members: {
                            some: {
                                user_id: userId
                            }
                        }
                    },
                    include: {
                        members: {
                            include: {
                                user: {
                                    select: {
                                        id: true,
                                        nick_name: true,
                                        avatar: true,
                                        licence_id: true
                                    }
                                }
                            }
                        },
                        chats: {
                            orderBy: { createdAt: "desc" },
                            take: 1,
                            include: {
                                sender: {
                                    select: {
                                        id: true,
                                        nick_name: true,
                                        avatar: true
                                    }
                                }
                            }
                        },
                        _count: {
                            select: {
                                chats: true
                            }
                        }
                    },
                    orderBy: {
                        updatedAt: "desc"
                    }
                }),
                this.prismaService.groupChatRoom.count({
                    where: {
                        members: {
                            some: {
                                user_id: userId
                            }
                        }
                    }
                })
            ])
        ]);

        const [oneToOneRooms, oneToOneTotal] = oneToOneData;
        const [groupRooms, groupTotal] = groupData;

        // Map one-to-one rooms
        const mappedOneToOneRooms = oneToOneRooms.map(async ({ user1, user2, _count, chats, ...room }) => {
            const otherUser = room.user1_id === userId ? user2 : user1;
            const latestChat = chats[0];
            const is_latest_message_mine = latestChat?.sender_id === userId;
            const isBlockedByMe = await this.prismaService.blockList.findFirst({where:{user_id:userId, blocked_user_id:otherUser.id}})
            const isBlockedMe = await this.prismaService.blockList.findFirst({where:{user_id:otherUser.id, blocked_user_id:userId}})
            const rating = await this.ratingService.getAverageRatingForUser(otherUser.id)
            
            Object.assign(otherUser, {rating:rating.averageRating})

            return {
                ...room,
                type: 'ONE_TO_ONE',
                otherUser,
                latest_message: latestChat ? {
                    ...latestChat,
                    is_mine: is_latest_message_mine
                } : null,
                unread_count: _count.chats,

                isBlockedByMe: isBlockedByMe ? true : false,
                isBlockedMe: isBlockedMe ? true : false
            };
        });

        // Map group rooms
        const mappedGroupRooms = groupRooms.map(({ members, chats, _count, ...room }) => {
            const latestChat = chats[0];
            const is_latest_message_mine = latestChat?.sender_id === userId;

            return {
                ...room,
                type: 'GROUP',
                group_members_count: members.length,
                group_members: members.map(m => ({
                    id: m.id,
                    user_id: m.user_id,
                    group_role: m.group_role,
                    user: m.user
                })),
                latest_message: latestChat ? {
                    id: latestChat.id,
                    groupChatRoom_id: latestChat.groupChatRoom_id,
                    sender_id: latestChat.sender_id,
                    message: latestChat.message,
                    createdAt: latestChat.createdAt,
                    type: latestChat.type,
                    file_url: latestChat.file_url,
                    file_name: latestChat.file_name,
                    file_size: latestChat.file_size,
                    file_mime_type: latestChat.file_mime_type,
                    sender: {
                        id: latestChat.sender.id,
                        nick_name: latestChat.sender.nick_name,
                        avatar: latestChat.sender.avatar
                    },
                    is_mine: is_latest_message_mine
                } : null,
                total_messages: _count.chats,
                unread_count: 0
            };
        });

        // Combine both room types and sort by updatedAt
        const allMappedOneToOne = await Promise.all(mappedOneToOneRooms);
        const allRooms = [...allMappedOneToOne, ...mappedGroupRooms]
            .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
            .slice(skip, skip + getUserRoomsDto.limit);

        const total = oneToOneTotal + groupTotal;

        return { rooms: allRooms, total };
    }

    /**
     * Get messages in a chat room
     * @param userId 
     * @param getAllMessageDto 
     * @returns 
     */
    async getRoomMessages(userId: string, getAllMessageDto: GetAllMessagesDto) {
        const skip = (getAllMessageDto.page - 1) * getAllMessageDto.limit;

        const isUserValid = await this.isUserExistOnRoom(userId, getAllMessageDto.roomId)
        
        if(!isUserValid){
            throw new BadRequestException("You are not allowed to see this room.")
        }
        

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

    async isUserExistOnRoom(userId:string, roomId:string){
        const room = await this.prismaService.chatRoom.findFirst({where:{
            id:roomId,
            OR:[
                {user1_id:userId},
                {user2_id:userId}
            ]
        }})

        if(room)
            return true

        return false
    }

    /**
     * Get or create a chat room with a user by their vehicle license plate number
     */
    async getOrCreateRoomByPlate(currentUserId: string, plateNo: string) {
        const cleanedPlate = plateNo.trim();

        if (!cleanedPlate) {
            throw new BadRequestException("License plate number cannot be empty");
        }

        const owner = await this.prismaService.user.findFirst({
            where: {
                licence_id: {
                    equals: cleanedPlate,
                    mode: 'insensitive'
                },
                is_deleted: false
            },
            select: {
                id: true,
                nick_name: true,
                avatar: true,
                is_blocked: true,
                is_vehicle_verified: true
            }
        });

        if (!owner) {
            throw new NotFoundException("No registered vehicle owner found for this license plate");
        }

        if (owner.is_blocked) {
            throw new BadRequestException("This user account has been blocked");
        }

        if (currentUserId === owner.id) {
            throw new BadRequestException("You cannot start a chat with yourself");
        }

        const room = await this.createChatRoomIfNotExists(currentUserId, owner.id);

        return {
            roomId: room.id,
            owner: {
                id: owner.id,
                nick_name: owner.nick_name,
                avatar: owner.avatar,
                is_vehicle_verified: owner.is_vehicle_verified
            }
        };
    }
}