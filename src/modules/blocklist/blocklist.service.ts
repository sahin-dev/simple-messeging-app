import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BlockUserDto } from './dtos/block-user.dto';

@Injectable()
export class BlocklistService {
  constructor(private readonly prismaService: PrismaService) {}

  async blockUser(userId: string, blockUserDto: BlockUserDto) {
    if (userId === blockUserDto.blockedUserId) {
      throw new BadRequestException('You cannot block yourself');
    }

    // Check if user exists
    const blockedUser = await this.prismaService.user.findUnique({
      where: { id: blockUserDto.blockedUserId },
    });

    if (!blockedUser) {
      throw new NotFoundException('User to block not found');
    }

    // Check if already blocked
    const existingBlock = await this.prismaService.blockList.findFirst({
      where: {
        user_id: userId,
        blocked_user_id: blockUserDto.blockedUserId,
      },
    });

    if (existingBlock) {
      throw new BadRequestException('User is already blocked');
    }

    return this.prismaService.blockList.create({
      data: {
        user_id: userId,
        blocked_user_id: blockUserDto.blockedUserId,
      },
      include: {
        blocked_user: {
          select: {
            id: true,
            nick_name: true,
            avatar: true,
          },
        },
      },
    });
  }

  async unblockUser(userId: string, blockedUserId: string) {
    const blockEntry = await this.prismaService.blockList.findFirst({
      where: {
        user_id: userId,
        blocked_user_id: blockedUserId,
      },
    });

    if (!blockEntry) {
      throw new NotFoundException('Block entry not found');
    }

    await this.prismaService.blockList.delete({
      where: { id: blockEntry.id },
    });

    return { message: 'User unblocked successfully' };
  }

  async getBlockedUsers(userId: string, page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;

    const [blockedUsers, total] = await Promise.all([
      this.prismaService.blockList.findMany({
        where: { user_id: userId },
        include: {
          blocked_user: {
            select: {
              id: true,
              nick_name: true,
              avatar: true,
              email: true,
            },
          },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prismaService.blockList.count({
        where: { user_id: userId },
      }),
    ]);

    return { blockedUsers, total, page, limit };
  }

  async isUserBlocked(userId: string, blockedUserId: string): Promise<boolean> {
    const blockEntry = await this.prismaService.blockList.findFirst({
      where: {
        user_id: userId,
        blocked_user_id: blockedUserId,
      },
    });

    return !!blockEntry;
  }

  async isBlockedByUser(userId: string, otherUserId: string): Promise<boolean> {
    const blockEntry = await this.prismaService.blockList.findFirst({
      where: {
        user_id: otherUserId,
        blocked_user_id: userId,
      },
    });

    return !!blockEntry;
  }

  async getBlockStatus(userId: string, otherUserId: string) {
    const [blockedByMe, blockedMe] = await Promise.all([
      this.isUserBlocked(userId, otherUserId),
      this.isBlockedByUser(userId, otherUserId),
    ]);

    return { blockedByMe, blockedMe };
  }
}
