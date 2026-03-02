import { Controller, Get, HttpCode, Param, Query, Req } from "@nestjs/common";
import { ChatService } from "./chat.service";
import { GetUserRoomsDto } from "./dtos/get-user-rooms.dto";
import { GetAllMessagesDto } from "./dtos/get-all-messages.dto";
import { ResponseMessage } from "src/common/decorators/apiResponseMessage.decorator";
import { TokenPayload } from "../auth/types/TokenPayload.type";

@Controller("chat")

export class ChatController {

    constructor(
        private readonly chatService: ChatService
    ) { }

    @Get("rooms")
    @HttpCode(200)
    @ResponseMessage("User chat rooms fetched successfully")
    async getUserChatRooms(
        @Req() request: Request,
        @Query() getUserRoomsDto: GetUserRoomsDto
    ) {

        const payload = request["payload"] as TokenPayload;
        return this.chatService.getUserChatRooms(payload.id, getUserRoomsDto);
    }

    @Get("rooms/messages")
    @HttpCode(200)
    @ResponseMessage("Room messages fetched successfully")
    async getRoomMessages(
        @Req() request: Request,
        @Query() getAllMessageDto: GetAllMessagesDto
    ) {

        const payload = request["payload"] as TokenPayload;
        return this.chatService.getRoomMessages(payload.id, getAllMessageDto);
    }

}