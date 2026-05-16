import { Controller, Post, Get, Put, Delete, Body, Param, Query, Req, HttpCode, Patch } from '@nestjs/common';
import { GroupChatService } from './group-chat.service';
import { CreateGroupChatRoomDto } from './dtos/create-group-chat-room.dto';
import { SendGroupMessageDto } from './dtos/send-group-message.dto';
import { UpdateGroupChatRoomDto } from './dtos/update-group-chat-room.dto';
import { AddGroupMembersDto } from './dtos/add-group-members.dto';
import { PaginationDto } from './dtos/pagination.dto';
import { TokenPayload } from '../auth/types/TokenPayload.type';
import { ResponseMessage } from 'src/common/decorators/apiResponseMessage.decorator';

@Controller('group')
export class GroupChatController {
  constructor(private readonly groupChatService: GroupChatService) {}

  @Post('room')
  @HttpCode(201)
  @ResponseMessage('Group chat room created successfully')
  async createGroupChatRoom(
    @Req() request: Request,
    @Body() createGroupChatRoomDto: CreateGroupChatRoomDto,
  ) {
    const payload = request['payload'] as TokenPayload;
    return this.groupChatService.createGroupChatRoom(payload.id, createGroupChatRoomDto);
  }

  @Post('message')
  @HttpCode(201)
  @ResponseMessage('Group message sent successfully')
  async sendGroupMessage(
    @Req() request: Request,
    @Body() sendGroupMessageDto: SendGroupMessageDto,
  ) {
    const payload = request['payload'] as TokenPayload;
    return this.groupChatService.sendGroupMessage(payload.id, sendGroupMessageDto);
  }

  @Get('rooms')
  @HttpCode(200)
  @ResponseMessage('Group chat rooms fetched successfully')
  async getGroupChatRooms(
    @Req() request: Request,
    @Query() paginationDto: PaginationDto,
  ) {
    const payload = request['payload'] as TokenPayload;
    return this.groupChatService.getGroupChatRooms(payload.id, paginationDto);
  }

  @Get('room/:roomId/messages')
  @HttpCode(200)
  @ResponseMessage('Group chat messages fetched successfully')
  async getGroupChatMessages(
    @Req() request: Request,
    @Param('roomId') roomId: string,
    @Query() paginationDto: PaginationDto,
  ) {
    const payload = request['payload'] as TokenPayload;
    return this.groupChatService.getGroupChatMessages(roomId, payload.id, paginationDto);
  }

  @Post('room/:roomId/member/:memberId')
  @HttpCode(200)
  @ResponseMessage('Member added to group successfully')
  async addGroupMember(
    @Req() request: Request,
    @Param('roomId') roomId: string,
    @Param('memberId') memberId: string,
  ) {
    const payload = request['payload'] as TokenPayload;
    return this.groupChatService.addGroupMember(roomId, payload.id, memberId);
  }

  @Post('room/:roomId/members')
  @HttpCode(200)
  @ResponseMessage('Members added to group successfully')
  async addGroupMembers(
    @Req() request: Request,
    @Param('roomId') roomId: string,
    @Body() addGroupMembersDto: AddGroupMembersDto,
  ) {
    const payload = request['payload'] as TokenPayload;
    return this.groupChatService.addGroupMembers(roomId, payload.id, addGroupMembersDto.memberIds);
  }

  @Delete('room/:roomId/member/:memberId')
  @HttpCode(200)
  @ResponseMessage('Member removed from group successfully')
  async removeGroupMember(
    @Req() request: Request,
    @Param('roomId') roomId: string,
    @Param('memberId') memberId: string,
  ) {
    const payload = request['payload'] as TokenPayload;
    return this.groupChatService.removeGroupMember(roomId, payload.id, memberId);
  }

  @Patch('room/:roomId')
  @HttpCode(200)
  @ResponseMessage('Group chat room updated successfully')
  async updateGroupChatRoom(
    @Req() request: Request,
    @Param('roomId') roomId: string,
    @Body() updateDto: UpdateGroupChatRoomDto,
  ) {
    const payload = request['payload'] as TokenPayload;
    return this.groupChatService.updateGroupChatRoom(roomId, payload.id, updateDto);
  }

  @Delete('room/:roomId/leave')
  @HttpCode(200)
  @ResponseMessage('Left group successfully')
  async leaveGroup(
    @Req() request: Request,
    @Param('roomId') roomId: string,
  ) {
    const payload = request['payload'] as TokenPayload;
    return this.groupChatService.leaveGroup(roomId, payload.id);
  }
}
