import { Injectable, BadRequestException, NotFoundException, forwardRef, Inject, Optional, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGroupChatRoomDto } from './dtos/create-group-chat-room.dto';
import { SendGroupMessageDto } from './dtos/send-group-message.dto';
import { SendGroupFileDto, SendGroupVoiceDto } from './dtos/send-group-file.dto';
import { UpdateGroupChatRoomDto } from './dtos/update-group-chat-room.dto';
import { PaginationDto } from './dtos/pagination.dto';
import { group } from 'console';
import { User } from 'generated/prisma/browser';
import { DefaultArgs } from '@prisma/client/runtime/library';
import { UserDelegate, UserWhereInput } from 'generated/prisma/models';
import { MessageType } from 'generated/prisma/enums';
import { NotificationDispatcherService } from '../notification/services/notification-dispatcher.service';
import * as fs from 'fs';

@Injectable()
export class GroupChatService {
  private readonly logger = new Logger(GroupChatService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly notificationDispatcherService: NotificationDispatcherService,
    @Optional()
    @Inject('SOCKET_ROOM_SERVICE')
    private readonly socketRoomService?: any,
  ) { }

  async createGroupChatRoom(userId: string, createGroupChatRoomDto: CreateGroupChatRoomDto, file?: Express.Multer.File) {
    // Ensure creator is included in members
    const memberIds = [...new Set([userId, ...createGroupChatRoomDto.memberIds])];

    const imagePath = file ? file.path.replace(/\\/g, '/') : createGroupChatRoomDto.image;

    const groupChatRoom = await this.prismaService.groupChatRoom.create({
      data: {
        name: createGroupChatRoomDto.name,
        image: imagePath,
        group_members_count: memberIds.length,
        members: {
          createMany: {
            data: memberIds.map((memberId, index) => ({
              user_id: memberId,
              group_role: index === 0 ? 'GROUP_ADMIN' : 'GROUP_MEMBER', // Creator is admin
            })),
          },
        },
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                nick_name: true,
                avatar: true,
              },
            },
          },
        },
      },
    });

    return groupChatRoom;
  }

  async sendGroupMessage(userId: string, sendGroupMessageDto: SendGroupMessageDto) {
    // Verify user is a member of the group
    const membership = await this.prismaService.groupChatRoomMember.findFirst({
      where: {
        groupChatRoom_id: sendGroupMessageDto.groupChatRoomId,
        user_id: userId,
      },
    });

    if (!membership) {
      throw new BadRequestException('You are not a member of this group');
    }

    const groupChat = await this.prismaService.groupChat.create({
      data: {
        groupChatRoom_id: sendGroupMessageDto.groupChatRoomId,
        sender_id: userId,
        message: sendGroupMessageDto.message,
        encryptionType: sendGroupMessageDto.encryptionType,
        encryptionVersion: sendGroupMessageDto.encryptionVersion,
        senderKeyId: sendGroupMessageDto.senderKeyId,
        nonce: sendGroupMessageDto.nonce,
        encryptedKeys: this.normalizeEncryptedKeys(sendGroupMessageDto.encryptedKeys) as any,
      },
      include: {
        sender: {
          select: {
            id: true,
            nick_name: true,
            avatar: true,
          },
        },
      },
    });

    // Update group chat room updatedAt
    const groupChatRoom = await this.prismaService.groupChatRoom.update({
      where: { id: sendGroupMessageDto.groupChatRoomId },
      data: { updatedAt: new Date() },
    });

    this.notificationDispatcherService.dispatchGroupChatNotification(groupChat, groupChatRoom).catch((err) => {
      this.logger.error(`Failed to dispatch group chat notification: ${err.message}`);
    });

    return groupChat;
  }

  async sendGroupFileMessage(userId: string, sendGroupFileDto: SendGroupFileDto, file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    await this.ensureGroupMember(sendGroupFileDto.groupChatRoomId, userId);

    const groupChat = await this.prismaService.groupChat.create({
      data: {
        groupChatRoom_id: sendGroupFileDto.groupChatRoomId,
        sender_id: userId,
        message: sendGroupFileDto.message || file.originalname,
        type: MessageType.FILE,
        file_url: `/uploads/chats/${file.filename}`,
        file_name: file.originalname,
        file_size: file.size,
        file_mime_type: file.mimetype,
        encryptionType: sendGroupFileDto.encryptionType,
        encryptionVersion: sendGroupFileDto.encryptionVersion,
        senderKeyId: sendGroupFileDto.senderKeyId,
        nonce: sendGroupFileDto.nonce,
        encryptedKeys: this.normalizeEncryptedKeys(sendGroupFileDto.encryptedKeys) as any,
      },
      include: {
        sender: {
          select: {
            id: true,
            nick_name: true,
            avatar: true,
          },
        },
      },
    });

    // Update group chat room updatedAt
    const groupChatRoom = await this.prismaService.groupChatRoom.update({
      where: { id: sendGroupFileDto.groupChatRoomId },
      data: { updatedAt: new Date() },
    });

    this.notificationDispatcherService.dispatchGroupChatNotification(groupChat, groupChatRoom).catch((err) => {
      this.logger.error(`Failed to dispatch group chat file notification: ${err.message}`);
    });

    await this.broadcastGroupMessage(sendGroupFileDto.groupChatRoomId, userId, groupChat);

    return groupChat;
  }

  async sendGroupVoiceMessage(userId: string, sendGroupVoiceDto: SendGroupVoiceDto, file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Voice file is required');
    }

    if (!file.mimetype.startsWith('audio/')) {
      throw new BadRequestException('Group voice message must be an audio file');
    }

    await this.ensureGroupMember(sendGroupVoiceDto.groupChatRoomId, userId);

    const groupChat = await this.prismaService.groupChat.create({
      data: {
        groupChatRoom_id: sendGroupVoiceDto.groupChatRoomId,
        sender_id: userId,
        message: sendGroupVoiceDto.message || file.originalname,
        type: MessageType.VOICE,
        file_url: `/uploads/chats/${file.filename}`,
        file_name: file.originalname,
        file_size: file.size,
        file_mime_type: file.mimetype,
        durationSeconds: sendGroupVoiceDto.durationSeconds,
        waveform: this.normalizeWaveform(sendGroupVoiceDto.waveform) as any,
        encryptionType: sendGroupVoiceDto.encryptionType,
        encryptionVersion: sendGroupVoiceDto.encryptionVersion,
        senderKeyId: sendGroupVoiceDto.senderKeyId,
        nonce: sendGroupVoiceDto.nonce,
        encryptedKeys: this.normalizeEncryptedKeys(sendGroupVoiceDto.encryptedKeys) as any,
      },
      include: {
        sender: {
          select: {
            id: true,
            nick_name: true,
            avatar: true,
          },
        },
      },
    });

    const groupChatRoom = await this.prismaService.groupChatRoom.update({
      where: { id: sendGroupVoiceDto.groupChatRoomId },
      data: { updatedAt: new Date() },
    });

    this.notificationDispatcherService.dispatchGroupChatNotification(groupChat, groupChatRoom).catch((err) => {
      this.logger.error(`Failed to dispatch group chat voice notification: ${err.message}`);
    });

    await this.broadcastGroupMessage(sendGroupVoiceDto.groupChatRoomId, userId, groupChat);

    return groupChat;
  }

  async getGroupChatRooms(userId: string, paginationDto: PaginationDto) {
    const skip = (paginationDto.page - 1) * paginationDto.limit;

    const [rooms, total] = await Promise.all([
      this.prismaService.groupChatRoom.findMany({
        where: {
          members: {
            some: {
              user_id: userId,
            },
          },
        },
        include: {
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  nick_name: true,
                  avatar: true,
                  lastSeenAt: true,
                },
              },
            },
          },
          chats: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            include: {
              sender: {
                select: {
                  id: true,
                  nick_name: true,
                },
              },
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: paginationDto.limit,
      }),
      this.prismaService.groupChatRoom.count({
        where: {
          members: {
            some: {
              user_id: userId,
            },
          },
        },
      }),
    ]);

    return {
      rooms: rooms.map((room) => ({
        ...room,
        members: room.members.map((member) => ({
          ...member,
          user: this.attachPresence(member.user),
        })),
        chats: room.chats.map((chat) => this.maskDeletedGroupMessage(chat)),
      })),
      total,
    };
  }

  async getGroupChatMessages(groupChatRoomId: string, userId: string, paginationDto: PaginationDto) {
    // Verify user is a member
    const membership = await this.prismaService.groupChatRoomMember.findFirst({
      where: {
        groupChatRoom_id: groupChatRoomId,
        user_id: userId,
      },
    });

    if (!membership) {
      throw new BadRequestException('You are not a member of this group');
    }

    const skip = (paginationDto.page - 1) * paginationDto.limit;

    const [messages, total] = await Promise.all([
      this.prismaService.groupChat.findMany({
        where: { groupChatRoom_id: groupChatRoomId },
        include: {
          sender: {
            select: {
              id: true,
              nick_name: true,
              avatar: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: paginationDto.limit,
      }),
      this.prismaService.groupChat.count({
        where: { groupChatRoom_id: groupChatRoomId },
      }),
    ]);

    // Mark as read for current user
    await this.prismaService.groupChatRoomMember.update({
      where: {
        id: membership.id,
      },
      data: {
        last_read_message_id: messages[0]?.id || null,
      },
    });

    const mappedMessages = messages.map((message) => ({
      ...this.maskDeletedGroupMessage(message),
      is_mine: message.sender_id === userId,
    }));

    return { messages: mappedMessages, total };
  }

  async deleteGroupMessageForEveryone(userId: string, messageId: string) {
    const message = await this.prismaService.groupChat.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      throw new NotFoundException('Group message not found');
    }

    const membership = await this.prismaService.groupChatRoomMember.findFirst({
      where: {
        groupChatRoom_id: message.groupChatRoom_id,
        user_id: userId,
      },
    });

    if (!membership) {
      throw new BadRequestException('You are not a member of this group');
    }

    const isSender = message.sender_id === userId;
    const isGroupAdmin = membership.group_role === 'GROUP_ADMIN';

    if (!isSender && !isGroupAdmin) {
      throw new BadRequestException('Only the sender or a group admin can delete this message');
    }

    if (message.isDeletedForEveryone) {
      return this.maskDeletedGroupMessage(message);
    }

    const deletedMessage = await this.prismaService.groupChat.update({
      where: { id: messageId },
      data: {
        message: '',
        file_url: null,
        file_name: null,
        file_size: null,
        file_mime_type: null,
        durationSeconds: null,
        waveform: null,
        encryptionType: null,
        encryptionVersion: null,
        senderKeyId: null,
        nonce: null,
        encryptedKeys: null,
        isDeletedForEveryone: true,
        deletedAt: new Date(),
        deletedById: userId,
      },
    });

    if (this.socketRoomService?.server) {
      const members = await this.prismaService.groupChatRoomMember.findMany({
        where: { groupChatRoom_id: deletedMessage.groupChatRoom_id },
        select: { user_id: true },
      });
      const payload = {
        messageId: deletedMessage.id,
        groupChatRoomId: deletedMessage.groupChatRoom_id,
        deletedById: userId,
        isDeletedForEveryone: true,
        deletedAt: deletedMessage.deletedAt,
      };

      members.forEach((member) => {
        this.socketRoomService.server.to(`user-${member.user_id}`).emit('group-message-deleted', payload);
      });
    }

    return this.maskDeletedGroupMessage(deletedMessage);
  }

  async getGroupMemberDeviceKeys(groupChatRoomId: string, userId: string) {
    const membership = await this.prismaService.groupChatRoomMember.findFirst({
      where: {
        groupChatRoom_id: groupChatRoomId,
        user_id: userId,
      },
    });

    if (!membership) {
      throw new BadRequestException('You are not a member of this group');
    }

    const members = await this.prismaService.groupChatRoomMember.findMany({
      where: { groupChatRoom_id: groupChatRoomId },
      include: {
        user: {
          select: {
            id: true,
            nick_name: true,
            avatar: true,
            deviceKeys: {
              where: { isActive: true },
              orderBy: { createdAt: 'desc' },
              select: {
                id: true,
                deviceId: true,
                publicKey: true,
                isActive: true,
                createdAt: true,
                updatedAt: true,
              },
            },
          },
        },
      },
    });

    return {
      groupChatRoomId,
      members: members.map((member) => ({
        userId: member.user_id,
        groupRole: member.group_role,
        user: member.user,
        deviceKeys: member.user.deviceKeys,
      })),
    };
  }

  async addGroupMember(groupChatRoomId: string, userId: string, newMemberId: string) {
    // Verify requester is admin
    const requesterMembership = await this.prismaService.groupChatRoomMember.findFirst({
      where: {
        groupChatRoom_id: groupChatRoomId,
        user_id: userId,
      },
    });

    if (!requesterMembership || requesterMembership.group_role !== 'GROUP_ADMIN') {
      throw new BadRequestException('Only group admin can add members');
    }

    // Check if user already exists
    const existingMember = await this.prismaService.groupChatRoomMember.findFirst({
      where: {
        groupChatRoom_id: groupChatRoomId,
        user_id: newMemberId,
      },
    });

    console.log(groupChatRoomId, newMemberId, existingMember)

    if (existingMember) {
      throw new BadRequestException('User is already a member of this group');
    }

    const newMember = await this.prismaService.groupChatRoomMember.create({
      data: {
        groupChatRoom_id: groupChatRoomId,
        user_id: newMemberId,
      },
      include: {
        user: {
          select: {
            id: true,
            nick_name: true,
            avatar: true,
          },
        },
      },
    });

    // Update member count
    const groupRoom = await this.prismaService.groupChatRoom.update({
      where: { id: groupChatRoomId },
      data: {
        group_members_count: {
          increment: 1,
        },
      },
    });

    this.notificationDispatcherService.dispatchGroupAddedNotification(groupChatRoomId, groupRoom.name, newMemberId).catch((err) => {
      this.logger.error(`Failed to dispatch group added notification for member ${newMemberId}: ${err.message}`);
    });

    return newMember;
  }

  async addGroupMembers(groupChatRoomId: string, userId: string, newMemberIds: string[]) {
    // Verify requester is admin
    const requesterMembership = await this.prismaService.groupChatRoomMember.findFirst({
      where: {
        groupChatRoom_id: groupChatRoomId,
        user_id: userId,
      },
    });

    if (!requesterMembership || requesterMembership.group_role !== 'GROUP_ADMIN') {
      throw new BadRequestException('Only group admin can add members');
    }

    // Remove duplicates from input
    const uniqueMemberIds = [...new Set(newMemberIds)];

    // Check for existing members
    const existingMembers = await this.prismaService.groupChatRoomMember.findMany({
      where: {
        groupChatRoom_id: groupChatRoomId,
        user_id: {
          in: uniqueMemberIds,
        },
      },
      select: {
        user_id: true,
      },
    });

    const existingMemberIds = existingMembers.map((m) => m.user_id);
    const newMembersToAdd = uniqueMemberIds.filter((id) => !existingMemberIds.includes(id));

    if (newMembersToAdd.length === 0) {
      throw new BadRequestException('All users are already members of this group');
    }

    // Add new members in batch
    const addedMembers = await this.prismaService.groupChatRoomMember.createMany({
      data: newMembersToAdd.map((memberId) => ({
        groupChatRoom_id: groupChatRoomId,
        user_id: memberId,
      })),
    });

    // Fetch the added members with user details
    const addedMembersWithDetails = await this.prismaService.groupChatRoomMember.findMany({
      where: {
        groupChatRoom_id: groupChatRoomId,
        user_id: {
          in: newMembersToAdd,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            nick_name: true,
            avatar: true,
          },
        },
      },
    });

    // Update member count
    const groupRoom = await this.prismaService.groupChatRoom.update({
      where: { id: groupChatRoomId },
      data: {
        group_members_count: {
          increment: newMembersToAdd.length,
        },
      },
    });

    newMembersToAdd.forEach((memberId) => {
      this.notificationDispatcherService.dispatchGroupAddedNotification(groupChatRoomId, groupRoom.name, memberId).catch((err) => {
        this.logger.error(`Failed to dispatch group added notification for member ${memberId}: ${err.message}`);
      });
    });

    return {
      addedCount: newMembersToAdd.length,
      alreadyMemberCount: existingMemberIds.length,
      members: addedMembersWithDetails,
    };
  }

  async removeGroupMember(groupChatRoomId: string, userId: string, memberId: string) {

    if (userId === memberId) {
      throw new BadRequestException("You can remove yourself")
    }
    // Verify requester is admin or removing self
    const requesterMembership = await this.prismaService.groupChatRoomMember.findFirst({
      where: {
        groupChatRoom_id: groupChatRoomId,
        user_id: userId,
      },
    });

    if (!requesterMembership) {
      throw new BadRequestException('You are not a member of this group');
    }

    if (userId !== memberId && requesterMembership.group_role !== 'GROUP_ADMIN') {
      throw new BadRequestException('Only group admin can remove other members');
    }

    const memberToRemove = await this.prismaService.groupChatRoomMember.findFirst({
      where: {
        groupChatRoom_id: groupChatRoomId,
        user_id: memberId,
      },
    });

    if (!memberToRemove) {
      throw new NotFoundException('Member not found in this group');
    }

    await this.prismaService.groupChatRoomMember.delete({
      where: { id: memberToRemove.id },
    });

    // Update member count
    const groupRoom = await this.prismaService.groupChatRoom.update({
      where: { id: groupChatRoomId },
      data: {
        group_members_count: {
          decrement: 1,
        },
      },
    });

    if (userId !== memberId) {
      this.notificationDispatcherService.dispatchGroupRemovedNotification(groupChatRoomId, groupRoom.name, memberId).catch((err) => {
        this.logger.error(`Failed to dispatch group removed notification for member ${memberId}: ${err.message}`);
      });
    }

    // Remove user from socket.io room if service is available
    if (this.socketRoomService) {
      try {
        await this.socketRoomService.removeUserFromGroupRoom(groupChatRoomId, memberId);
        await this.socketRoomService.broadcastUserRemoved(groupChatRoomId, memberId, userId);
      } catch (err) {
        this.logger.error(`Failed to handle socket.io room removal for member removal:`, err);
      }
    }

    return { message: 'Member removed successfully' };
  }

  async updateGroupChatRoom(groupChatRoomId: string, userId: string, updateDto: UpdateGroupChatRoomDto, file?: Express.Multer.File) {
    // Verify requester is admin
    const membership = await this.prismaService.groupChatRoomMember.findFirst({
      where: {
        groupChatRoom_id: groupChatRoomId,
        user_id: userId,
      },
    });

    if (!membership || membership.group_role !== 'GROUP_ADMIN') {
      throw new BadRequestException('Only group admin can update group details');
    }

    const room = await this.prismaService.groupChatRoom.findUnique({
      where: { id: groupChatRoomId },
    });

    if (!room) {
      throw new NotFoundException('Group chat room not found');
    }

    if (file && room.image) {

      console.log(file)
      this.deleteGroupImage(room.image);
    }

    const imagePath = file ? file.path.replace(/\\/g, '/') : updateDto.image;

    const updatedRoom = await this.prismaService.groupChatRoom.update({
      where: { id: groupChatRoomId },
      data: {
        name: updateDto.name,
        image: imagePath,
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                nick_name: true,
                avatar: true,
              },
            },
          },
        },
      },
    });

    return updatedRoom;
  }

  private deleteGroupImage(imagePath: string) {
    try {
      if (imagePath) {
        const normalizedPath = imagePath.startsWith('/') ? imagePath.substring(1) : imagePath;
        if (fs.existsSync(normalizedPath)) {
          fs.unlinkSync(normalizedPath);
          this.logger.log(`Old group image deleted successfully: ${normalizedPath}`);
        }
      }
    } catch (error:any) {
      this.logger.error(`Failed to delete old group image: ${error.message}`);
    }
  }

  private normalizeEncryptedKeys(encryptedKeys?: Array<Record<string, any>> | string) {
    if (!encryptedKeys) {
      return undefined;
    }

    if (typeof encryptedKeys !== 'string') {
      if (!Array.isArray(encryptedKeys)) {
        throw new BadRequestException('encryptedKeys must be an array');
      }

      return encryptedKeys;
    }

    try {
      const parsed = JSON.parse(encryptedKeys);

      if (!Array.isArray(parsed)) {
        throw new BadRequestException('encryptedKeys must be a valid JSON array');
      }

      return parsed;
    } catch {
      throw new BadRequestException('encryptedKeys must be a valid JSON array');
    }
  }

  private normalizeWaveform(waveform?: number[] | string) {
    if (!waveform) {
      return undefined;
    }

    if (typeof waveform !== 'string') {
      if (!Array.isArray(waveform)) {
        throw new BadRequestException('waveform must be an array');
      }

      return waveform;
    }

    try {
      const parsed = JSON.parse(waveform);

      if (!Array.isArray(parsed)) {
        throw new BadRequestException('waveform must be a valid JSON array');
      }

      return parsed;
    } catch {
      throw new BadRequestException('waveform must be a valid JSON array');
    }
  }

  async ensureGroupMember(groupChatRoomId: string, userId: string) {
    const membership = await this.prismaService.groupChatRoomMember.findFirst({
      where: {
        groupChatRoom_id: groupChatRoomId,
        user_id: userId,
      },
    });

    if (!membership) {
      throw new BadRequestException('You are not a member of this group');
    }

    return membership;
  }

  private async broadcastGroupMessage(groupChatRoomId: string, senderId: string, groupChat: any) {
    if (!this.socketRoomService?.server) {
      return;
    }

    const members = await this.prismaService.groupChatRoomMember.findMany({
      where: { groupChatRoom_id: groupChatRoomId },
      select: { user_id: true },
    });

    members.forEach((member) => {
      const userRoomId = `user-${member.user_id}`;
      const isMine = member.user_id === senderId;

      if (isMine) {
        this.socketRoomService.server.to(userRoomId).emit('group-message-sent', {
          ...groupChat,
          is_mine: true,
        });
      } else {
        this.socketRoomService.server.to(userRoomId).emit('group-new-message', {
          ...groupChat,
          groupChatRoomId,
          is_mine: false,
        });
      }
    });
  }

  private maskDeletedGroupMessage(message: any) {
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
      nonce: null,
      encryptedKeys: null,
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

  async leaveGroup(groupChatRoomId: string, userId: string) {
    const membership = await this.prismaService.groupChatRoomMember.findFirst({
      where: {
        groupChatRoom_id: groupChatRoomId,
        user_id: userId,
      },
    });

    if (!membership) {
      throw new NotFoundException('You are not a member of this group');
    }

    // Check if user is an admin
    if (membership.group_role === 'GROUP_ADMIN') {
      // Count other admins
      const otherAdminsCount = await this.prismaService.groupChatRoomMember.count({
        where: {
          groupChatRoom_id: groupChatRoomId,
          group_role: 'GROUP_ADMIN',
          user_id: {
            not: userId,
          },
        },
      });

      // If no other admins exist, promote the earliest joined member
      if (otherAdminsCount === 0) {
        const earliestMember = await this.prismaService.groupChatRoomMember.findFirst({
          where: {
            groupChatRoom_id: groupChatRoomId,
            user_id: {
              not: userId,
            },
          },
          orderBy: {
            createdAt: 'asc',
          },
        });

        if (earliestMember) {
          await this.prismaService.groupChatRoomMember.update({
            where: { id: earliestMember.id },
            data: { group_role: 'GROUP_ADMIN' },
          });
        }
      }
    }

    // Delete the member
    await this.prismaService.groupChatRoomMember.delete({
      where: { id: membership.id },
    });

    // Get remaining member count
    const remainingMembersCount = await this.prismaService.groupChatRoomMember.count({
      where: {
        groupChatRoom_id: groupChatRoomId,
      },
    });

    // Remove user from socket.io room if service is available
    if (this.socketRoomService) {
      try {
        await this.socketRoomService.removeUserFromGroupRoom(groupChatRoomId, userId);
        await this.socketRoomService.broadcastUserLeft(groupChatRoomId, userId);
      } catch (err) {
        this.logger.error(`Failed to handle socket.io room removal for user leaving:`, err);
      }
    }

    // If no members left, delete the group
    if (remainingMembersCount === 0) {
      await this.prismaService.groupChatRoom.delete({
        where: { id: groupChatRoomId },
      });
      return { message: 'Left group successfully. Group has been deleted as no members remain' };
    }

    // Update member count
    await this.prismaService.groupChatRoom.update({
      where: { id: groupChatRoomId },
      data: {
        group_members_count: {
          decrement: 1,
        },
      },
    });

    return { message: 'Left group successfully' };
  }


  async getGroupMembers(groupChatRoomId: string, userId: string, paginationDto: PaginationDto) {
    // Verify user is a member
    const membership = await this.prismaService.groupChatRoomMember.findFirst({
      where: {
        groupChatRoom_id: groupChatRoomId,
        user_id: userId,
      },
    });

    if (!membership) {
      throw new NotFoundException('You are not a member of this group');
    }

    const skip = (paginationDto.page - 1) * paginationDto.limit;
    const take = paginationDto.limit;


    const [members, total] = await Promise.all([
      this.prismaService.groupChatRoomMember.findMany({
        where: { groupChatRoom_id: groupChatRoomId },
        include: {
          user: {
            select: {
              id: true,
              nick_name: true,
              avatar: true,
            },
          },
        },
        skip,
        take,
      }),
      this.prismaService.groupChatRoomMember.count({
        where: { groupChatRoom_id: groupChatRoomId },
      }),
    ]);

    return { members, total };
  }

  async getUsersForAddingToGroup(groupChatRoomId: string, userId: string, paginationDto: PaginationDto) {
    // Verify user is a member
    const membership = await this.prismaService.groupChatRoomMember.findFirst({
      where: {
        groupChatRoom_id: groupChatRoomId,
        user_id: userId,
      },
    });

    if (!membership) {
      throw new NotFoundException('You are not a member of this group');
    }

    const skip = (paginationDto.page - 1) * paginationDto.limit;

    const [users, total] = await Promise.all([
      this.prismaService.user.findMany({
        where: {
          NOT: {
            groupChatRooms: {
              some: {
                groupChatRoom_id: groupChatRoomId,
              },
            },
          },
        },
        select: {
          id: true,
          nick_name: true,
          avatar: true,
        },
        skip,
        take: paginationDto.limit,
      }),
      this.prismaService.user.count({
        where: {
          NOT: {
            groupChatRooms: {
              some: {
                groupChatRoom_id: groupChatRoomId,
              },
            },
          },
        },
      }),
    ]);

    return { users, total };
  }

  async searchUsersToAddToGroup(groupChatRoomId: string, userId: string, query: string, paginationDto: PaginationDto) {


    // Verify user is a member
    const membership = await this.prismaService.groupChatRoomMember.findFirst({
      where: {
        groupChatRoom_id: groupChatRoomId,
        user_id: userId,
      },
    });

    if (!membership) {
      throw new NotFoundException('You are not a member of this group');
    }



    const skip = (paginationDto.page - 1) * paginationDto.limit;

    const searchUserWhere: UserWhereInput = {
      NOT: {
        groupChatRooms: {
          some: {
            groupChatRoom_id: groupChatRoomId,
          },
        },
      },
      OR: [
        { nick_name: { contains: query, mode: 'insensitive' } },
        { email: { contains: query, mode: 'insensitive' } },
      ],

    }

    const [users, total] = await Promise.all([
      this.prismaService.user.findMany({
        where: searchUserWhere,
        select: {
          id: true,
          nick_name: true,
          avatar: true,
        },
        skip,
        take: paginationDto.limit,
      }),
      this.prismaService.user.count({
        where: searchUserWhere
      }),
    ]);

    return { users, total };
  }

}
