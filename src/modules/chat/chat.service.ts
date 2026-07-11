import { BadRequestException, Injectable, Inject, Optional, NotFoundException, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SendMessageDto } from "./dtos/send-message.dto";
import { GetAllMessagesDto } from "./dtos/get-all-messages.dto";
import { GetUserRoomsDto } from "./dtos/get-user-rooms.dto";
import { SocketGateway } from "./gateway/chat.gateway";
import { RatingService } from "../rating/rating.service";
import { SendFileDto } from "./dtos/send-file.dto";
import { MessageType } from "generated/prisma/enums";
import { NotificationDispatcherService } from "../notification/services/notification-dispatcher.service";
import { CreateMessageRequestDto, RegisterDeviceKeyDto } from "./dtos/message-request.dto";
import { SendVoiceDto } from "./dtos/send-file.dto";

@Injectable()
export class ChatService {
    private readonly logger = new Logger(ChatService.name);

    constructor(
        private readonly prismaService: PrismaService,
        private readonly ratingService: RatingService,
        private readonly notificationDispatcherService: NotificationDispatcherService,
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

        const isBlockExist = await this.prismaService.blockList.findFirst({
            where: {
                OR: [
                    { blocked_user_id: userId, user_id: sendMessageDto.receiver_id },
                    { blocked_user_id: sendMessageDto.receiver_id, user_id: userId }
                ]
            }
        })

        if (isBlockExist) {
            throw new BadRequestException("You can not messaged this account")
        }

        const presetMessage = sendMessageDto.presetMessageId
            ? await this.getActivePresetMessage(sendMessageDto.presetMessageId)
            : null;

        const finalMessage = sendMessageDto.message || presetMessage?.message;

        if (!finalMessage) {
            throw new BadRequestException("Message is required");
        }

        const existingRoom = await this.getChatRoomIfExist(userId, sendMessageDto.receiver_id);

        if (!existingRoom && presetMessage?.type !== 'ALERT') {
            const request = await this.createOrUpdatePendingMessageRequest(userId, {
                receiverId: sendMessageDto.receiver_id,
                firstMessage: finalMessage,
                presetMessageId: sendMessageDto.presetMessageId,
            });

            this.notificationDispatcherService.dispatchSystemNotification(
                [sendMessageDto.receiver_id],
                'New message request',
                'Someone wants to send you a message',
                { messageRequestId: request.id, senderId: userId, type: 'MESSAGE_REQUEST' },
            ).catch(err => {
                this.logger.error("Failed to dispatch message request notification:", err);
            });

            return { isMessageRequest: true, request };
        }

        const room = existingRoom ?? await this.createChatRoomIfNotExists(userId, sendMessageDto.receiver_id);

        const createdChat = await this.prismaService.chat.create({
            data: {
                chatRoom_id: room.id,
                sender_id: userId,
                receiver_id: sendMessageDto.receiver_id,
                message: finalMessage,
                encryptionType: sendMessageDto.encryptionType,
                encryptionVersion: sendMessageDto.encryptionVersion,
                senderKeyId: sendMessageDto.senderKeyId,
                receiverKeyId: sendMessageDto.receiverKeyId,
                nonce: sendMessageDto.nonce,
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

        this.notificationDispatcherService.dispatchChatNotification(createdChat, sendMessageDto.receiver_id).catch(err => {
            this.logger.error("Failed to dispatch chat notification:", err);
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

        const room = await this.getChatRoomIfExist(userId, sendFileDto.receiver_id);

        if (!room) {
            throw new BadRequestException("The receiver must accept your message request before you can send files");
        }

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
                encryptionType: sendFileDto.encryptionType,
                encryptionVersion: sendFileDto.encryptionVersion,
                senderKeyId: sendFileDto.senderKeyId,
                receiverKeyId: sendFileDto.receiverKeyId,
                nonce: sendFileDto.nonce,
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

        this.notificationDispatcherService.dispatchChatNotification(createdChat, sendFileDto.receiver_id).catch(err => {
            this.logger.error("Failed to dispatch chat notification:", err);
        });

        return createdChat;
    }

    async sendVoiceMessage(userId: string, sendVoiceDto: SendVoiceDto, file: Express.Multer.File) {
        if (!file) {
            throw new BadRequestException("Voice file is required");
        }

        if (!file.mimetype.startsWith("audio/")) {
            throw new BadRequestException("Voice message must be an audio file");
        }

        if (userId === sendVoiceDto.receiver_id) {
            throw new BadRequestException("You can not message yourself!");
        }

        const receiverUser = await this.prismaService.user.findUnique({
            where: { id: sendVoiceDto.receiver_id }
        });

        if (!receiverUser) {
            throw new BadRequestException("Receiver user not found");
        }

        const room = await this.getChatRoomIfExist(userId, sendVoiceDto.receiver_id);

        if (!room) {
            throw new BadRequestException("The receiver must accept your message request before you can send voice messages");
        }

        const createdChat = await this.prismaService.chat.create({
            data: {
                chatRoom_id: room.id,
                sender_id: userId,
                receiver_id: sendVoiceDto.receiver_id,
                message: sendVoiceDto.message || file.originalname,
                type: MessageType.VOICE,
                file_url: `/uploads/chats/${file.filename}`,
                file_name: file.originalname,
                file_size: file.size,
                file_mime_type: file.mimetype,
                durationSeconds: sendVoiceDto.durationSeconds,
                waveform: sendVoiceDto.waveform as any,
                encryptionType: sendVoiceDto.encryptionType,
                encryptionVersion: sendVoiceDto.encryptionVersion,
                senderKeyId: sendVoiceDto.senderKeyId,
                receiverKeyId: sendVoiceDto.receiverKeyId,
                nonce: sendVoiceDto.nonce,
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
            data: { updatedAt: new Date() }
        });

        if (this.socketRoomService && this.socketRoomService.server) {
            const server = this.socketRoomService.server;
            server.to(`user-${sendVoiceDto.receiver_id}`).emit("new-message", { ...createdChat, is_mine: false });
            server.to(`user-${userId}`).emit("message-sent", { ...createdChat, is_mine: true });
        }

        this.notificationDispatcherService.dispatchChatNotification(createdChat, sendVoiceDto.receiver_id).catch(err => {
            this.logger.error("Failed to dispatch chat notification:", err);
        });

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

    private async getActivePresetMessage(presetMessageId: string) {
        const presetMessage = await this.prismaService.presetMessage.findUnique({
            where: { id: presetMessageId },
        });

        if (!presetMessage || !presetMessage.isActive) {
            throw new NotFoundException("Preset message not found");
        }

        return presetMessage;
    }

    private async createOrUpdatePendingMessageRequest(
        senderId: string,
        dto: CreateMessageRequestDto,
    ) {
        const existingRequest = await this.prismaService.messageRequest.findUnique({
            where: {
                senderId_receiverId: {
                    senderId,
                    receiverId: dto.receiverId,
                },
            },
        });

        if (existingRequest?.status === 'ACCEPTED') {
            return existingRequest;
        }

        if (existingRequest?.status === 'DECLINED') {
            throw new BadRequestException("The receiver declined this message request");
        }

        if (dto.presetMessageId) {
            const preset = await this.getActivePresetMessage(dto.presetMessageId);
            if (preset.type === 'ALERT') {
                throw new BadRequestException("Alert preset messages are delivered directly and do not create requests");
            }
        }

        if (existingRequest) {
            return this.prismaService.messageRequest.update({
                where: { id: existingRequest.id },
                data: {
                    firstMessage: dto.firstMessage,
                    presetMessageId: dto.presetMessageId,
                    status: 'PENDING',
                },
            });
        }

        return this.prismaService.messageRequest.create({
            data: {
                senderId,
                receiverId: dto.receiverId,
                firstMessage: dto.firstMessage,
                presetMessageId: dto.presetMessageId,
                status: 'PENDING',
            },
        });
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

    async createMessageRequest(userId: string, dto: CreateMessageRequestDto) {
        if (userId === dto.receiverId) {
            throw new BadRequestException("You can not message yourself!");
        }

        const receiver = await this.prismaService.user.findUnique({
            where: { id: dto.receiverId },
        });

        if (!receiver) {
            throw new NotFoundException("Receiver user not found");
        }

        const existingRoom = await this.getChatRoomIfExist(userId, dto.receiverId);
        if (existingRoom) {
            return {
                isExistingChat: true,
                roomId: existingRoom.id,
            };
        }

        return this.createOrUpdatePendingMessageRequest(userId, dto);
    }

    async getMessageRequestInbox(userId: string, page: number = 1, limit: number = 10) {
        const skip = (Number(page) - 1) * Number(limit);

        const [requests, total] = await Promise.all([
            this.prismaService.messageRequest.findMany({
                where: { receiverId: userId, status: 'PENDING' },
                skip,
                take: Number(limit),
                orderBy: { createdAt: 'desc' },
            }),
            this.prismaService.messageRequest.count({
                where: { receiverId: userId, status: 'PENDING' },
            }),
        ]);

        const senderIds = [...new Set(requests.map((request) => request.senderId))];
        const senders = await this.prismaService.user.findMany({
            where: { id: { in: senderIds } },
            select: { id: true, nick_name: true, avatar: true, licence_id: true },
        });
        const senderById = new Map(senders.map((sender) => [sender.id, sender]));

        return {
            requests: requests.map((request) => ({
                ...request,
                sender: senderById.get(request.senderId) ?? null,
            })),
            total,
            page: Number(page),
            limit: Number(limit),
        };
    }

    async acceptMessageRequest(userId: string, requestId: string) {
        const request = await this.prismaService.messageRequest.findUnique({
            where: { id: requestId },
        });

        if (!request) {
            throw new NotFoundException("Message request not found");
        }

        if (request.receiverId !== userId) {
            throw new BadRequestException("Only the receiver can accept this message request");
        }

        if (request.status !== 'PENDING') {
            throw new BadRequestException("Only pending message requests can be accepted");
        }

        const room = await this.createChatRoomIfNotExists(request.senderId, request.receiverId);
        let deliveredMessage: any = null;

        if (request.firstMessage) {
            deliveredMessage = await this.prismaService.chat.create({
                data: {
                    chatRoom_id: room.id,
                    sender_id: request.senderId,
                    receiver_id: request.receiverId,
                    message: request.firstMessage,
                },
                include: {
                    sender: {
                        select: { id: true, nick_name: true, avatar: true }
                    },
                    receiver: {
                        select: { id: true, nick_name: true, avatar: true }
                    },
                },
            });

            await this.prismaService.chatRoom.update({
                where: { id: room.id },
                data: { updatedAt: new Date() },
            });

            if (this.socketRoomService && this.socketRoomService.server) {
                const server = this.socketRoomService.server;
                server.to(`user-${request.senderId}`).emit("message-request-accepted", {
                    requestId: request.id,
                    roomId: room.id,
                    message: { ...deliveredMessage, is_mine: true },
                });
                server.to(`user-${request.receiverId}`).emit("new-message", {
                    ...deliveredMessage,
                    is_mine: false,
                });
            }
        }

        const updatedRequest = await this.prismaService.messageRequest.update({
            where: { id: request.id },
            data: {
                status: 'ACCEPTED',
                roomId: room.id,
            },
        });

        return { request: updatedRequest, room, deliveredMessage };
    }

    async declineMessageRequest(userId: string, requestId: string) {
        const request = await this.prismaService.messageRequest.findUnique({
            where: { id: requestId },
        });

        if (!request) {
            throw new NotFoundException("Message request not found");
        }

        if (request.receiverId !== userId) {
            throw new BadRequestException("Only the receiver can decline this message request");
        }

        if (request.status !== 'PENDING') {
            throw new BadRequestException("Only pending message requests can be declined");
        }

        return this.prismaService.messageRequest.update({
            where: { id: request.id },
            data: { status: 'DECLINED' },
        });
    }

    async registerDeviceKey(userId: string, dto: RegisterDeviceKeyDto) {
        return this.prismaService.userDeviceKey.upsert({
            where: {
                userId_deviceId: {
                    userId,
                    deviceId: dto.deviceId,
                },
            },
            create: {
                userId,
                deviceId: dto.deviceId,
                publicKey: dto.publicKey,
                isActive: true,
            },
            update: {
                publicKey: dto.publicKey,
                isActive: true,
            },
        });
    }

    async getUserDeviceKeys(userId: string) {
        return this.prismaService.userDeviceKey.findMany({
            where: { userId, isActive: true },
            orderBy: { createdAt: 'desc' },
        });
    }

    async deactivateDeviceKey(userId: string, deviceId: string) {
        const key = await this.prismaService.userDeviceKey.findUnique({
            where: {
                userId_deviceId: {
                    userId,
                    deviceId,
                },
            },
        });

        if (!key) {
            throw new NotFoundException("Device key not found");
        }

        return this.prismaService.userDeviceKey.update({
            where: {
                userId_deviceId: {
                    userId,
                    deviceId,
                },
            },
            data: { isActive: false },
        });
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
                                is_vehicle_verified: true
                            },

                        },
                        user2: {
                            select: {
                                id: true,
                                nick_name: true,
                                licence_id: true,
                                avatar: true,
                                is_vehicle_verified: true
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
            const isBlockedByMe = await this.prismaService.blockList.findFirst({ where: { user_id: userId, blocked_user_id: otherUser.id } })
            const isBlockedMe = await this.prismaService.blockList.findFirst({ where: { user_id: otherUser.id, blocked_user_id: userId } })
            const rating = await this.ratingService.getAverageRatingForUser(otherUser.id)

            Object.assign(otherUser, {
                rating: rating.averageRating,
                totalRating: rating.totalRatings,
                totalRatings: rating.totalRatings
            })

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

        if (!isUserValid) {
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

    async isUserExistOnRoom(userId: string, roomId: string) {
        const room = await this.prismaService.chatRoom.findFirst({
            where: {
                id: roomId,
                OR: [
                    { user1_id: userId },
                    { user2_id: userId }
                ]
            }
        })

        if (room)
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
                licence_id: true,
                is_blocked: true,
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

        const existingRoom = await this.getChatRoomIfExist(currentUserId, owner.id);

        const ratingData = await this.ratingService.getAverageRatingForUser(owner.id);

        const user = {
            id: owner.id,
            nick_name: owner.nick_name,
            avatar: owner.avatar,
            licence_id: owner.licence_id,
            is_blocked: owner.is_blocked,
            rating: ratingData.averageRating,
            totalRating: ratingData.totalRatings,
            totalRatings: ratingData.totalRatings
        };

        if (existingRoom) {
            return {
                roomId: existingRoom.id,
                user,
                isExistingChat: true
            };
        }

        return {
            user,
            isExistingChat: false
        };
    }
}
