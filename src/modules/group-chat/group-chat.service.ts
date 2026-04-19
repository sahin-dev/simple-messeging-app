import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGroupChatRoomDto } from './dtos/create-group-chat-room.dto';
import { SendGroupMessageDto } from './dtos/send-group-message.dto';
import { UpdateGroupChatRoomDto } from './dtos/update-group-chat-room.dto';
import { PaginationDto } from './dtos/pagination.dto';

@Injectable()
export class GroupChatService {
  constructor(private readonly prismaService: PrismaService) {}

  async createGroupChatRoom(userId: string, createGroupChatRoomDto: CreateGroupChatRoomDto) {
    // Ensure creator is included in members
    const memberIds = [...new Set([userId, ...createGroupChatRoomDto.memberIds])];

    const groupChatRoom = await this.prismaService.groupChatRoom.create({
      data: {
        name: createGroupChatRoomDto.name,
        image: createGroupChatRoomDto.image,
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
    await this.prismaService.groupChatRoom.update({
      where: { id: sendGroupMessageDto.groupChatRoomId },
      data: { updatedAt: new Date() },
    });

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

    return { rooms, total };
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
      ...message,
      is_mine: message.sender_id === userId,
    }));

    return { messages: mappedMessages, total };
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
    await this.prismaService.groupChatRoom.update({
      where: { id: groupChatRoomId },
      data: {
        group_members_count: {
          increment: 1,
        },
      },
    });

    return newMember;
  }

  async removeGroupMember(groupChatRoomId: string, userId: string, memberId: string) {
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
    await this.prismaService.groupChatRoom.update({
      where: { id: groupChatRoomId },
      data: {
        group_members_count: {
          decrement: 1,
        },
      },
    });

    return { message: 'Member removed successfully' };
  }

  async updateGroupChatRoom(groupChatRoomId: string, userId: string, updateDto: UpdateGroupChatRoomDto) {
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

    const updatedRoom = await this.prismaService.groupChatRoom.update({
      where: { id: groupChatRoomId },
      data: updateDto,
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

    await this.prismaService.groupChatRoomMember.delete({
      where: { id: membership.id },
    });

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
}
