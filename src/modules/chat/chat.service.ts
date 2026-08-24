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

        if (!existingRoom) {
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
        const firstMessage = await this.resolveMessageRequestFirstMessage(dto);
        await this.deleteLegacyWithdrawnMessageRequests({
            senderId,
            receiverId: dto.receiverId,
        });

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

        if (existingRequest) {
            return this.prismaService.messageRequest.update({
                where: { id: existingRequest.id },
                data: {
                    firstMessage,
                    presetMessageId: dto.presetMessageId,
                    status: 'PENDING',
                    roomId: null,
                },
            });
        }

        return this.prismaService.messageRequest.create({
            data: {
                senderId,
                receiverId: dto.receiverId,
                firstMessage,
                presetMessageId: dto.presetMessageId,
                status: 'PENDING',
            },
        });
    }

    private async resolveMessageRequestFirstMessage(dto: CreateMessageRequestDto) {
        if (!dto.presetMessageId) {
            if (dto.firstMessage?.trim()) {
                throw new BadRequestException("Message requests can only include an alert preset message");
            }

            return null;
        }

        const preset = await this.getActivePresetMessage(dto.presetMessageId);
        if (preset.type !== 'ALERT') {
            throw new BadRequestException("Message request preset must be an alert type");
        }

        return preset.message;
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

        const isBlockExist = await this.prismaService.blockList.findFirst({
            where: {
                OR: [
                    { blocked_user_id: userId, user_id: dto.receiverId },
                    { blocked_user_id: dto.receiverId, user_id: userId }
                ]
            }
        });

        if (isBlockExist) {
            throw new BadRequestException("You can not send a message request to this account");
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
            select: {
                id: true,
                nick_name: true,
                avatar: true,
                licence_id: true,
                email_verified: true,
                license_no_verified: true,
                is_vehicle_verified: true,
            },
        });
        const senderById = new Map(senders.map((sender) => [sender.id, sender]));

        return {
            requests: requests.map((request) => this.formatMessageRequestForReceiver(
                request,
                senderById.get(request.senderId) ?? null,
            )),
            total,
            page: Number(page),
            limit: Number(limit),
        };
    }

    async getSentMessageRequests(userId: string, page: number = 1, limit: number = 10) {
        const skip = (Number(page) - 1) * Number(limit);
        await this.deleteLegacyWithdrawnMessageRequests({ senderId: userId });

        const [requests, total] = await Promise.all([
            this.prismaService.messageRequest.findMany({
                where: {
                    senderId: userId,
                    status: { in: ['PENDING', 'ACCEPTED', 'DECLINED'] as any },
                },
                skip,
                take: Number(limit),
                orderBy: { createdAt: 'desc' },
            }),
            this.prismaService.messageRequest.count({
                where: {
                    senderId: userId,
                    status: { in: ['PENDING', 'ACCEPTED', 'DECLINED'] as any },
                },
            }),
        ]);

        const receiverIds = [...new Set(requests.map((request) => request.receiverId))];
        const receivers = await this.prismaService.user.findMany({
            where: { id: { in: receiverIds } },
            select: {
                id: true,
                nick_name: true,
                avatar: true,
                licence_id: true,
                email_verified: true,
                license_no_verified: true,
                is_vehicle_verified: true,
            },
        });
        const receiverById = new Map(receivers.map((receiver) => [receiver.id, receiver]));

        return {
            requests: requests.map((request) => this.formatMessageRequestForSender(
                request,
                receiverById.get(request.receiverId) ?? null,
            )),
            total,
            page: Number(page),
            limit: Number(limit),
        };
    }

    async getMessageRequestThread(userId: string, requestId: string) {
        const request = await this.prismaService.messageRequest.findUnique({
            where: { id: requestId },
        });

        if (!request) {
            throw new NotFoundException("Message request not found");
        }

        if (request.senderId !== userId && request.receiverId !== userId) {
            throw new BadRequestException("You are not allowed to view this message request");
        }

        const otherUserId = request.senderId === userId ? request.receiverId : request.senderId;
        const otherUser = await this.prismaService.user.findUnique({
            where: { id: otherUserId },
            select: {
                id: true,
                nick_name: true,
                avatar: true,
                licence_id: true,
                email_verified: true,
                license_no_verified: true,
                is_vehicle_verified: true,
                lastSeenAt: true,
            },
        });

        const message = request.firstMessage
            ? [{
                id: request.id,
                requestId: request.id,
                chatRoom_id: null,
                sender_id: request.senderId,
                receiver_id: request.receiverId,
                message: request.firstMessage,
                type: 'REQUEST_PREVIEW',
                createdAt: request.createdAt,
                updatedAt: request.updatedAt,
                is_mine: request.senderId === userId,
            }]
            : [];

        return {
            type: 'MESSAGE_REQUEST',
            request: this.formatMessageRequestState(request),
            otherUser: otherUser ? this.attachPresence(otherUser) : null,
            messages: message,
            actions: this.getMessageRequestActions(request, userId),
        };
    }

    async getMessageRequestCounts(userId: string) {
        const [receivedPending, sentPending, sentAccepted, sentDeclined] = await Promise.all([
            this.prismaService.messageRequest.count({
                where: { receiverId: userId, status: 'PENDING' },
            }),
            this.prismaService.messageRequest.count({
                where: { senderId: userId, status: 'PENDING' },
            }),
            this.prismaService.messageRequest.count({
                where: { senderId: userId, status: 'ACCEPTED' },
            }),
            this.prismaService.messageRequest.count({
                where: { senderId: userId, status: 'DECLINED' },
            }),
        ]);

        return {
            received: {
                pending: receivedPending,
            },
            sent: {
                pending: sentPending,
                accepted: sentAccepted,
                declined: sentDeclined,
                total: sentPending + sentAccepted + sentDeclined,
            },
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

        }

        const updatedRequest = await this.prismaService.messageRequest.update({
            where: { id: request.id },
            data: {
                status: 'ACCEPTED',
                roomId: room.id,
            },
        });

        if (this.socketRoomService && this.socketRoomService.server) {
            const server = this.socketRoomService.server;
            server.to(`user-${request.senderId}`).emit("message-request-accepted", {
                requestId: request.id,
                roomId: room.id,
                message: deliveredMessage ? { ...deliveredMessage, is_mine: true } : null,
            });
            server.to(`user-${request.receiverId}`).emit("message-request-accepted", {
                requestId: request.id,
                roomId: room.id,
                message: deliveredMessage ? { ...deliveredMessage, is_mine: false } : null,
            });
            if (deliveredMessage) {
                server.to(`user-${request.receiverId}`).emit("new-message", {
                    ...deliveredMessage,
                    is_mine: false,
                });
            }
        }

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

    async blockMessageRequestSender(userId: string, requestId: string) {
        const request = await this.prismaService.messageRequest.findUnique({
            where: { id: requestId },
        });

        if (!request) {
            throw new NotFoundException("Message request not found");
        }

        if (request.receiverId !== userId) {
            throw new BadRequestException("Only the receiver can block this message request sender");
        }

        if (request.status !== 'PENDING') {
            throw new BadRequestException("Only pending message requests can be blocked");
        }

        const existingBlock = await this.prismaService.blockList.findUnique({
            where: {
                user_id_blocked_user_id: {
                    user_id: userId,
                    blocked_user_id: request.senderId,
                },
            },
        });

        const block = existingBlock ?? await this.prismaService.blockList.create({
            data: {
                user_id: userId,
                blocked_user_id: request.senderId,
            },
        });

        const updatedRequest = await this.prismaService.messageRequest.update({
            where: { id: request.id },
            data: { status: 'DECLINED' },
        });

        return { request: updatedRequest, block };
    }

    async withdrawMessageRequest(userId: string, requestId: string) {
        const request = await this.prismaService.messageRequest.findUnique({
            where: { id: requestId },
        });

        if (!request) {
            throw new NotFoundException("Message request not found");
        }

        if (request.senderId !== userId) {
            throw new BadRequestException("Only the sender can withdraw this message request");
        }

        if (request.status !== 'PENDING') {
            throw new BadRequestException("Only pending message requests can be withdrawn");
        }

        await this.prismaService.messageRequest.delete({
            where: { id: request.id },
        });

        return {
            message: "Message request withdrawn successfully",
            deleted: true,
            requestId: request.id,
        };
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

        // Fetch one-to-one rooms, group rooms, and pending incoming message requests in parallel.
        const [oneToOneData, groupData, messageRequestData] = await Promise.all([
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
                                        is_vehicle_verified: true,
                                        lastSeenAt: true
                                    },

                                },
                        user2: {
                            select: {
                                id: true,
                                        nick_name: true,
                                        licence_id: true,
                                        avatar: true,
                                        is_vehicle_verified: true,
                                        lastSeenAt: true
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
                                        licence_id: true,
                                        lastSeenAt: true
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
            ]),
            Promise.all([
                this.prismaService.messageRequest.findMany({
                    where: {
                        receiverId: userId,
                        status: 'PENDING',
                    },
                    orderBy: {
                        updatedAt: "desc",
                    },
                }),
                this.prismaService.messageRequest.count({
                    where: {
                        receiverId: userId,
                        status: 'PENDING',
                    },
                }),
            ]),
        ]);

        const [oneToOneRooms, oneToOneTotal] = oneToOneData;
        const [groupRooms, groupTotal] = groupData;
        const [messageRequests, messageRequestTotal] = messageRequestData;
        const messageRequestSenderIds = [...new Set(messageRequests.map((request) => request.senderId))];
        const messageRequestSenders = await this.prismaService.user.findMany({
            where: { id: { in: messageRequestSenderIds } },
            select: {
                id: true,
                nick_name: true,
                licence_id: true,
                avatar: true,
                is_vehicle_verified: true,
                lastSeenAt: true,
            },
        });
        const messageRequestSenderById = new Map(
            messageRequestSenders.map((sender) => [sender.id, sender]),
        );

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
                otherUser: this.attachPresence(otherUser),
                latest_message: latestChat ? {
                    ...this.maskDeletedChatMessage(latestChat),
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
            const maskedLatestChat = latestChat ? this.maskDeletedChatMessage(latestChat) : null;
            const is_latest_message_mine = latestChat?.sender_id === userId;

            return {
                ...room,
                type: 'GROUP',
                group_members_count: members.length,
                group_members: members.map(m => ({
                    id: m.id,
                    user_id: m.user_id,
                    group_role: m.group_role,
                    user: this.attachPresence(m.user)
                })),
                latest_message: maskedLatestChat ? {
                    id: latestChat.id,
                    groupChatRoom_id: latestChat.groupChatRoom_id,
                    sender_id: latestChat.sender_id,
                    message: maskedLatestChat.message,
                    createdAt: latestChat.createdAt,
                    type: latestChat.type,
                    file_url: maskedLatestChat.file_url,
                    file_name: maskedLatestChat.file_name,
                    file_size: maskedLatestChat.file_size,
                    file_mime_type: maskedLatestChat.file_mime_type,
                    isDeletedForEveryone: maskedLatestChat.isDeletedForEveryone,
                    deletedAt: maskedLatestChat.deletedAt,
                    deletedById: maskedLatestChat.deletedById,
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

        const mappedMessageRequests = messageRequests.map(async (request) => {
            const sender = messageRequestSenderById.get(request.senderId) ?? null;
            const rating = sender
                ? await this.ratingService.getAverageRatingForUser(sender.id)
                : null;

            if (sender && rating) {
                Object.assign(sender, {
                    rating: rating.averageRating,
                    totalRating: rating.totalRatings,
                    totalRatings: rating.totalRatings,
                });
            }

            return {
                id: request.id,
                type: 'MESSAGE_REQUEST',
                threadType: 'MESSAGE_REQUEST',
                requestId: request.id,
                roomId: null,
                status: request.status,
                otherUser: sender ? this.attachPresence(sender) : null,
                request: this.formatMessageRequestState(request),
                latest_message: request.firstMessage ? {
                    id: request.id,
                    requestId: request.id,
                    chatRoom_id: null,
                    sender_id: request.senderId,
                    receiver_id: request.receiverId,
                    message: request.firstMessage,
                    type: 'REQUEST_PREVIEW',
                    createdAt: request.createdAt,
                    updatedAt: request.updatedAt,
                    is_mine: false,
                } : null,
                unread_count: 1,
                canAccept: true,
                canReject: true,
                canBlock: false,
                actions: ['ACCEPT', 'REJECT'],
                createdAt: request.createdAt,
                updatedAt: request.updatedAt,
            };
        });

        // Combine room and request types so the client can render one inbox list.
        const allMappedOneToOne = await Promise.all(mappedOneToOneRooms);
        const allMappedMessageRequests = await Promise.all(mappedMessageRequests);
        const allRooms = [...allMappedOneToOne, ...mappedGroupRooms, ...allMappedMessageRequests]
            .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
            .slice(skip, skip + getUserRoomsDto.limit);

        const total = oneToOneTotal + groupTotal + messageRequestTotal;

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
            return { ...this.maskDeletedChatMessage(message), is_mine };
        });

        // const reversedMessages = mappedMessages.reverse();
        return { messages: mappedMessages, total };
    }

    async deleteMessageForEveryone(userId: string, messageId: string) {
        const chat = await this.prismaService.chat.findUnique({
            where: { id: messageId },
        });

        if (!chat) {
            throw new NotFoundException("Message not found");
        }

        if (chat.sender_id !== userId) {
            throw new BadRequestException("Only the sender can delete this message");
        }

        if (chat.isDeletedForEveryone) {
            return this.maskDeletedChatMessage(chat);
        }

        const deletedChat = await this.prismaService.chat.update({
            where: { id: messageId },
            data: {
                message: "",
                file_url: null,
                file_name: null,
                file_size: null,
                file_mime_type: null,
                durationSeconds: null,
                waveform: null,
                encryptionType: null,
                encryptionVersion: null,
                senderKeyId: null,
                receiverKeyId: null,
                nonce: null,
                isDeletedForEveryone: true,
                deletedAt: new Date(),
                deletedById: userId,
            },
        });

        const payload = {
            messageId: deletedChat.id,
            roomId: deletedChat.chatRoom_id,
            deletedById: userId,
            isDeletedForEveryone: true,
            deletedAt: deletedChat.deletedAt,
        };

        if (this.socketRoomService?.server) {
            this.socketRoomService.server.to(`user-${deletedChat.sender_id}`).emit("message-deleted", payload);
            this.socketRoomService.server.to(`user-${deletedChat.receiver_id}`).emit("message-deleted", payload);
        }

        return this.maskDeletedChatMessage(deletedChat);
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

    async ensureUserCanTypeInRoom(userId: string, roomId: string, receiverId: string) {
        if (userId === receiverId) {
            throw new BadRequestException("You can not type to yourself");
        }

        const room = await this.prismaService.chatRoom.findFirst({
            where: {
                id: roomId,
                OR: [
                    { user1_id: userId, user2_id: receiverId },
                    { user1_id: receiverId, user2_id: userId },
                ],
            },
        });

        if (!room) {
            throw new BadRequestException("You are not allowed to type in this room.");
        }

        return room;
    }

    private maskDeletedChatMessage(message: any) {
        if (!message?.isDeletedForEveryone) {
            return message;
        }

        return {
            ...message,
            message: null,
            file_url: null,
            file_name: null,
            file_size: null,
            file_mime_type: null,
            durationSeconds: null,
            waveform: null,
            encryptionType: null,
            encryptionVersion: null,
            senderKeyId: null,
            receiverKeyId: null,
            nonce: null,
        };
    }

    private attachPresence<T extends { id: string; lastSeenAt?: Date | string | null }>(user: T) {
        const presence = this.socketRoomService?.getPresence
            ? this.socketRoomService.getPresence(user.id, user.lastSeenAt)
            : { isOnline: false, lastSeenAt: user.lastSeenAt ?? null };

        return {
            ...user,
            isOnline: presence.isOnline,
            lastSeenAt: presence.lastSeenAt,
        };
    }

    private formatMessageRequestState(request: any) {
        return {
            id: request.id,
            senderId: request.senderId,
            receiverId: request.receiverId,
            roomId: request.roomId,
            firstMessage: request.firstMessage,
            presetMessageId: request.presetMessageId,
            status: request.status,
            createdAt: request.createdAt,
            updatedAt: request.updatedAt,
        };
    }

    private formatMessageRequestForReceiver(request: any, sender: any) {
        return {
            ...this.formatMessageRequestState(request),
            sender: sender ? this.attachPresence(sender) : null,
            canAccept: request.status === 'PENDING',
            canReject: request.status === 'PENDING',
            canBlock: request.status === 'PENDING',
            threadType: 'MESSAGE_REQUEST',
        };
    }

    private formatMessageRequestForSender(request: any, receiver: any) {
        return {
            ...this.formatMessageRequestState(request),
            receiver: receiver ? this.attachPresence(receiver) : null,
            canWithdraw: request.status === 'PENDING',
            canMessage: request.status === 'ACCEPTED' && Boolean(request.roomId),
            threadType: request.status === 'ACCEPTED' ? 'CHAT_ROOM' : 'MESSAGE_REQUEST',
        };
    }

    private getMessageRequestActions(request: any, userId: string) {
        if (request.status !== 'PENDING') {
            return [];
        }

        if (request.receiverId === userId) {
            return ['ACCEPT', 'REJECT'];
        }

        if (request.senderId === userId) {
            return ['WITHDRAW'];
        }

        return [];
    }

    private async deleteLegacyWithdrawnMessageRequests(where: {
        senderId?: string;
        receiverId?: string;
    }) {
        const filter: Record<string, string> = {
            status: 'WITHDRAWN',
        };

        if (where.senderId) {
            filter.senderId = where.senderId;
        }

        if (where.receiverId) {
            filter.receiverId = where.receiverId;
        }

        try {
            await this.prismaService.$runCommandRaw({
                delete: 'message_requests',
                deletes: [
                    {
                        q: filter,
                        limit: 0,
                    },
                ],
            });
        } catch (error: any) {
            this.logger.warn(`Failed to clean up legacy withdrawn message requests: ${error.message}`);
        }
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
