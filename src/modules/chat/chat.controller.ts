import { Controller, Get, HttpCode, Param, Query, Req, Post, UploadedFile, UseInterceptors, Body } from "@nestjs/common";
import { ChatService } from "./chat.service";
import { GetUserRoomsDto } from "./dtos/get-user-rooms.dto";
import { GetAllMessagesDto } from "./dtos/get-all-messages.dto";
import { ResponseMessage } from "src/common/decorators/apiResponseMessage.decorator";
import { TokenPayload } from "../auth/types/TokenPayload.type";
import { FileInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { randomUUID } from "crypto";
import { SendFileDto } from "./dtos/send-file.dto";

@Controller("chat")

export class ChatController {

    constructor(
        private readonly chatService: ChatService
    ) { }

    @Post("message/file")
    @HttpCode(201)
    @UseInterceptors(FileInterceptor("file", {
        limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
        storage: diskStorage({
            destination: "./uploads/chats",
            filename: (req, file, cb) => {
                const uuid = randomUUID().toString();
                const ext = file.originalname.split(".").pop() || "bin";
                cb(null, `chat_${uuid}.${ext}`);
            }
        })
    }))
    @ResponseMessage("File sent successfully")
    async sendFileMessage(
        @Req() request: Request,
        @Body() sendFileDto: SendFileDto,
        @UploadedFile() file: Express.Multer.File,
    ) {
        const payload = request["payload"] as TokenPayload;
        return this.chatService.sendFileMessage(payload.id, sendFileDto, file);
    }

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

    @Post("rooms/by-plate")
    @HttpCode(200)
    @ResponseMessage("Conversation started successfully")
    async startConversationByPlate(
        @Req() request: Request,
        @Body("plate_no") plate_no: string
    ) {
        const payload = request["payload"] as TokenPayload;
        return this.chatService.getOrCreateRoomByPlate(payload.id, plate_no);
    }
}