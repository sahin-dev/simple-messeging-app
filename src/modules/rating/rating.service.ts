import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRatingDto } from './dtos/create-rating.dto';
import { UpdateRatingStatusDto } from './dtos/update-rating-status.dto';
import { RatingStatus } from 'generated/prisma/enums';

@Injectable()
export class RatingService {
  constructor(private readonly prismaService: PrismaService) {}

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

    return this.prismaService.userRating.create({
      data: {
        rater_id: userId,
        ratee_id: createRatingDto.ratee_id,
        rating: createRatingDto.rating,
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
  }

  async updateRatingStatus(ratingId: string, updateRatingStatusDto: UpdateRatingStatusDto) {
    const rating = await this.prismaService.userRating.findUnique({
      where: { id: ratingId },
    });

    if (!rating) {
      throw new NotFoundException('Rating not found');
    }

    return this.prismaService.userRating.update({
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
}
