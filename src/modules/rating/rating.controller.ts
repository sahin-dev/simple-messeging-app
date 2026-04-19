import { Body, Controller, Get, Param, Patch, Post, Delete, Query, Req, HttpCode } from '@nestjs/common';
import { RatingService } from './rating.service';
import { CreateRatingDto } from './dtos/create-rating.dto';
import { UpdateRatingStatusDto } from './dtos/update-rating-status.dto';
import { TokenPayload } from '../auth/types/TokenPayload.type';
import { ResponseMessage } from 'src/common/decorators/apiResponseMessage.decorator';
import { RatingStatus } from 'generated/prisma/enums';

@Controller('ratings')
export class RatingController {
  constructor(private readonly ratingService: RatingService) {}

  @Post()
  @HttpCode(201)
  @ResponseMessage('Rating created successfully')
  async createRating(@Req() request: Request, @Body() createRatingDto: CreateRatingDto) {
    const payload = request['payload'] as TokenPayload;
    return this.ratingService.createRating(payload.id, createRatingDto);
  }

  @Patch(':id/status')
  @HttpCode(200)
  @ResponseMessage('Rating status updated successfully')
  async updateRatingStatus(
    @Param('id') ratingId: string,
    @Body() updateRatingStatusDto: UpdateRatingStatusDto,
  ) {
    return this.ratingService.updateRatingStatus(ratingId, updateRatingStatusDto);
  }

  @Get('user/:userId')
  @HttpCode(200)
  @ResponseMessage('User ratings fetched successfully')
  async getRatingsForUser(
    @Param('userId') userId: string,
    @Query('status') status?: RatingStatus,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    return this.ratingService.getRatingsForUser(userId, status, page, limit);
  }

  @Get('user/:userId/average')
  @HttpCode(200)
  @ResponseMessage('Average rating fetched successfully')
  async getAverageRatingForUser(@Param('userId') userId: string) {
    return this.ratingService.getAverageRatingForUser(userId);
  }

  @Get('status/:status')
  @HttpCode(200)
  @ResponseMessage('Ratings by status fetched successfully')
  async getRatingsByStatus(
    @Param('status') status: RatingStatus,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    return this.ratingService.getRatingsByStatus(status, page, limit);
  }

  @Delete(':id')
  @HttpCode(200)
  @ResponseMessage('Rating deleted successfully')
  async deleteRating(@Param('id') ratingId: string) {
    return this.ratingService.deleteRating(ratingId);
  }

  @Get(':id')
  @HttpCode(200)
  @ResponseMessage('Rating fetched successfully')
  async getRatingById(@Param('id') ratingId: string) {
    return this.ratingService.getRatingById(ratingId);
  }
}
