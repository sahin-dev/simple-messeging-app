import { Controller, Post, Get, Delete, Body, Param, Query, Req, HttpCode } from '@nestjs/common';
import { BlocklistService } from './blocklist.service';
import { BlockUserDto } from './dtos/block-user.dto';
import { TokenPayload } from '../auth/types/TokenPayload.type';
import { ResponseMessage } from 'src/common/decorators/apiResponseMessage.decorator';

@Controller('blocklist')
export class BlocklistController {
  constructor(private readonly blocklistService: BlocklistService) {}

  @Post('block')
  @HttpCode(201)
  @ResponseMessage('User blocked successfully')
  async blockUser(
    @Req() request: Request,
    @Body() blockUserDto: BlockUserDto,
  ) {
    const payload = request['payload'] as TokenPayload;
    return this.blocklistService.blockUser(payload.id, blockUserDto);
  }

  @Delete('unblock/:blockedUserId')
  @HttpCode(200)
  @ResponseMessage('User unblocked successfully')
  async unblockUser(
    @Req() request: Request,
    @Param('blockedUserId') blockedUserId: string,
  ) {
    const payload = request['payload'] as TokenPayload;
    return this.blocklistService.unblockUser(payload.id, blockedUserId);
  }

  @Get('blocked-users')
  @HttpCode(200)
  @ResponseMessage('Blocked users fetched successfully')
  async getBlockedUsers(
    @Req() request: Request,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    const payload = request['payload'] as TokenPayload;
    return this.blocklistService.getBlockedUsers(payload.id, page, limit);
  }

  @Get('status/:userId')
  @HttpCode(200)
  @ResponseMessage('Block status fetched successfully')
  async getBlockStatus(
    @Req() request: Request,
    @Param('userId') userId: string,
  ) {
    const payload = request['payload'] as TokenPayload;
    return this.blocklistService.getBlockStatus(payload.id, userId);
  }
}
