import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRatingDto } from './dtos/create-rating.dto';
import { UpdateRatingStatusDto } from './dtos/update-rating-status.dto';
import { RatingStatus } from 'generated/prisma/enums';
import { NotificationDispatcherService } from '../notification/services/notification-dispatcher.service';

@Injectable()
export class RatingService {
  private readonly logger = new Logger(RatingService.name);
  
  constructor(
    private readonly prismaService: PrismaService,
    private readonly notificationDispatcherService: NotificationDispatcherService,
  ) {}

  async createRating(userId: string, createRatingDto: CreateRatingDto) {
    if (userId === createRatingDto.ratee_id) {
      throw new BadRequestException('You cannot rate yourself');
    }

    // Check if ratee exists
    const ratee = await this.prismaService.user.findUnique({
      where: { id: createRatingDto.ratee_id },
    });

    if (!ratee) {
      throw new NotFoundException('User to rate not found');
    }

    // Check if rating already exists
    const existingRating = await this.prismaService.userRating.findFirst({
      where: {
        rater_id: userId,
        ratee_id: createRatingDto.ratee_id,
      },
    });

    if (existingRating) {
      throw new BadRequestException('You have already rated this user');
    }

    // Validate rating value (assuming 1-5 scale)
    if (createRatingDto.rating < 1 || createRatingDto.rating > 5) {
      throw new BadRequestException('Rating must be between 1 and 5');
    }

    const rating = await this.prismaService.userRating.create({
      data: {
        rater_id: userId,
        ratee_id: createRatingDto.ratee_id,
        rating: createRatingDto.rating,
        review: createRatingDto.review,
        status: 'PENDING',
      },
      include: {
        rater: {
          select: {
            id: true,
            nick_name: true,
            avatar: true,
          },
        },
        ratee: {
          select: {
            id: true,
            nick_name: true,
            avatar: true,
          },
        },
      },
    });

    const raterName = rating.rater?.nick_name || 'A user';
    const rateeName = rating.ratee?.nick_name || 'another user';
    this.notificationDispatcherService.dispatchAdminNotification(
      'New Rating Pending Mod',
      `${raterName} submitted a ${rating.rating}-star rating for ${rateeName} and needs moderation.`,
      { ratingId: rating.id }
    ).catch((err) => {
      this.logger.error(`Failed to notify admins of new rating: ${err.message}`);
    });

    return rating;
  }

  async updateRatingStatus(ratingId: string, updateRatingStatusDto: UpdateRatingStatusDto) {
    const rating = await this.prismaService.userRating.findUnique({
      where: { id: ratingId },
    });

    if (!rating) {
      throw new NotFoundException('Rating not found');
    }

    const updatedRating = await this.prismaService.userRating.update({
      where: { id: ratingId },
      data: {
        status: updateRatingStatusDto.status,
      },
      include: {
        rater: {
          select: {
            id: true,
            nick_name: true,
          },
        },
        ratee: {
          select: {
            id: true,
            nick_name: true,
          },
        },
      },
    });

    if (updateRatingStatusDto.status === RatingStatus.PUBLISHED) {
      this.notificationDispatcherService.dispatchRatingNotification(updatedRating).catch((err) => {
        this.logger.error(`Failed to dispatch rating notification: ${err.message}`);
      });
    }

    return updatedRating;
  }

  async getRatingsForUser(userId: string, status?: RatingStatus, page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;

    const where: any = { ratee_id: userId };
    if (status) {
      where.status = status;
    }

    const [ratings, total] = await Promise.all([
      this.prismaService.userRating.findMany({
        where,
        include: {
          rater: {
            select: {
              id: true,
              nick_name: true,
              avatar: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prismaService.userRating.count({ where }),
    ]);

    return { ratings, total, page, limit };
  }

  async getAverageRatingForUser(userId: string) {
    const ratings = await this.prismaService.userRating.findMany({
      where: {
        ratee_id: userId,
        status: 'PUBLISHED',
      },
      select: {
        rating: true,
      },
    });

    if (ratings.length === 0) {
      return { userId, averageRating: 0, totalRatings: 0 };
    }

    const averageRating = ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length;

    return {
      userId,
      averageRating: Math.round(averageRating * 10) / 10,
      totalRatings: ratings.length,
    };
  }

  async getRatingsByStatus(status: RatingStatus, page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;

    const [ratings, total] = await Promise.all([
      this.prismaService.userRating.findMany({
        where: { status },
        include: {
          rater: {
            select: {
              id: true,
              nick_name: true,
              avatar: true,
            },
          },
          ratee: {
            select: {
              id: true,
              nick_name: true,
              avatar: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prismaService.userRating.count({ where: { status } }),
    ]);

    return { ratings, total, page, limit };
  }

  async deleteRating(ratingId: string) {
    const rating = await this.prismaService.userRating.findUnique({
      where: { id: ratingId },
    });

    if (!rating) {
      throw new NotFoundException('Rating not found');
    }

    await this.prismaService.userRating.delete({
      where: { id: ratingId },
    });

    return { message: 'Rating deleted successfully' };
  }

  async getRatingById(ratingId: string) {
    const rating = await this.prismaService.userRating.findUnique({
      where: { id: ratingId },
      include: {
        rater: {
          select: {
            id: true,
            nick_name: true,
            avatar: true,
          },
        },
        ratee: {
          select: {
            id: true,
            nick_name: true,
            avatar: true,
          },
        },
      },
    });

    if (!rating) {
      throw new NotFoundException('Rating not found');
    }

    return rating;
  }

  /**
   * Get the rating that a user gave to another user
   * @param raterId - ID of the user who gave the rating
   * @param rateeId - ID of the user who received the rating
   */
  async getMyRatingForUser(raterId: string, rateeId: string) {
    if (raterId === rateeId) {
      throw new BadRequestException('You cannot rate yourself');
    }

    const rating = await this.prismaService.userRating.findFirst({
      where: {
        rater_id: raterId,
        ratee_id: rateeId,
      },
      include: {
        rater: {
          select: {
            id: true,
            nick_name: true,
            avatar: true,
          },
        },
        ratee: {
          select: {
            id: true,
            nick_name: true,
            avatar: true,
          },
        },
      },
    });

    if(!rating){
      throw new NotFoundException("rating not found")
    }

    return rating;
  }

  /**
   * Update the rating that a user gave to another user
   * @param raterId - ID of the user who gave the rating
   * @param rateeId - ID of the user who received the rating
   * @param updateRatingDto - Updated rating value
   */
  async updateMyRatingForUser(raterId: string, rateeId: string, updateRatingDto: any) {
    if (raterId === rateeId) {
      throw new BadRequestException('You cannot rate yourself');
    }

    // Check if ratee exists
    const ratee = await this.prismaService.user.findUnique({
      where: { id: rateeId },
    });

    if (!ratee) {
      throw new NotFoundException('User to rate not found');
    }

    // Validate rating value
    if (updateRatingDto.rating < 1 || updateRatingDto.rating > 5) {
      throw new BadRequestException('Rating must be between 1 and 5');
    }

    // Check if rating exists
    const existingRating = await this.prismaService.userRating.findFirst({
      where: {
        rater_id: raterId,
        ratee_id: rateeId,
      },
    });

    if (!existingRating) {
      throw new NotFoundException('You have not rated this user yet');
    }

    // Update the rating
    const updatedRating = await this.prismaService.userRating.update({
      where: { id: existingRating.id },
      data: {
        rating: updateRatingDto.rating,
        review: updateRatingDto.review,
        status:RatingStatus.PENDING
      },
      include: {
        rater: {
          select: {
            id: true,
            nick_name: true,
            avatar: true,
          },
        },
        ratee: {
          select: {
            id: true,
            nick_name: true,
            avatar: true,
          },
        },
      },
    });

    const raterName = updatedRating.rater?.nick_name || 'A user';
    const rateeName = updatedRating.ratee?.nick_name || 'another user';
    this.notificationDispatcherService.dispatchAdminNotification(
      'Updated Rating Pending Mod',
      `${raterName} updated their rating for ${rateeName} to ${updatedRating.rating} stars, which needs moderation.`,
      { ratingId: updatedRating.id }
    ).catch((err) => {
      this.logger.error(`Failed to notify admins of updated rating: ${err.message}`);
    });

    return updatedRating;
  }
}
