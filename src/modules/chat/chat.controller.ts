import { Controller, Delete, Get, HttpCode, Param, Query, Req, Post, UploadedFile, UseInterceptors, Body } from "@nestjs/common";
import { ChatService } from "./chat.service";
import { GetUserRoomsDto } from "./dtos/get-user-rooms.dto";
import { GetAllMessagesDto } from "./dtos/get-all-messages.dto";
import { ResponseMessage } from "src/common/decorators/apiResponseMessage.decorator";
import { TokenPayload } from "../auth/types/TokenPayload.type";
import { FileInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { randomUUID } from "crypto";
import { SendFileDto, SendVoiceDto } from "./dtos/send-file.dto";
import { CreateMessageRequestDto, RegisterDeviceKeyDto } from "./dtos/message-request.dto";

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

    @Post("message/voice")
    @HttpCode(201)
    @UseInterceptors(FileInterceptor("file", {
        limits: { fileSize: 10 * 1024 * 1024 },
        storage: diskStorage({
            destination: "./uploads/chats",
            filename: (req, file, cb) => {
                const uuid = randomUUID().toString();
                const ext = file.originalname.split(".").pop() || "audio";
                cb(null, `voice_${uuid}.${ext}`);
            }
        })
    }))
    @ResponseMessage("Voice message sent successfully")
    async sendVoiceMessage(
        @Req() request: Request,
        @Body() sendVoiceDto: SendVoiceDto,
        @UploadedFile() file: Express.Multer.File,
    ) {
        const payload = request["payload"] as TokenPayload;
        return this.chatService.sendVoiceMessage(payload.id, sendVoiceDto, file);
    }

    @Delete("messages/:messageId")
    @HttpCode(200)
    @ResponseMessage("Message deleted successfully")
    async deleteMessage(
        @Req() request: Request,
        @Param("messageId") messageId: string,
    ) {
        const payload = request["payload"] as TokenPayload;
        return this.chatService.deleteMessageForEveryone(payload.id, messageId);
    }

    @Post("message-requests")
    @HttpCode(201)
    @ResponseMessage("Message request created successfully")
    async createMessageRequest(
        @Req() request: Request,
        @Body() dto: CreateMessageRequestDto,
    ) {
        const payload = request["payload"] as TokenPayload;
        return this.chatService.createMessageRequest(payload.id, dto);
    }

    @Get("message-requests/inbox")
    @HttpCode(200)
    @ResponseMessage("Message requests fetched successfully")
    async getMessageRequestInbox(
        @Req() request: Request,
        @Query("page") page: number = 1,
        @Query("limit") limit: number = 10,
    ) {
        const payload = request["payload"] as TokenPayload;
        return this.chatService.getMessageRequestInbox(payload.id, page, limit);
    }

    @Get("message-requests/sent")
    @HttpCode(200)
    @ResponseMessage("Sent message requests fetched successfully")
    async getSentMessageRequests(
        @Req() request: Request,
        @Query("page") page: number = 1,
        @Query("limit") limit: number = 10,
    ) {
        const payload = request["payload"] as TokenPayload;
        return this.chatService.getSentMessageRequests(payload.id, page, limit);
    }

    @Post("message-requests/:id/accept")
    @HttpCode(200)
    @ResponseMessage("Message request accepted successfully")
    async acceptMessageRequest(
        @Req() request: Request,
        @Param("id") requestId: string,
    ) {
        const payload = request["payload"] as TokenPayload;
        return this.chatService.acceptMessageRequest(payload.id, requestId);
    }

    @Post("message-requests/:id/decline")
    @HttpCode(200)
    @ResponseMessage("Message request declined successfully")
    async declineMessageRequest(
        @Req() request: Request,
        @Param("id") requestId: string,
    ) {
        const payload = request["payload"] as TokenPayload;
        return this.chatService.declineMessageRequest(payload.id, requestId);
    }

    @Post("e2ee/device-key")
    @HttpCode(201)
    @ResponseMessage("Device key registered successfully")
    async registerDeviceKey(
        @Req() request: Request,
        @Body() dto: RegisterDeviceKeyDto,
    ) {
        const payload = request["payload"] as TokenPayload;
        return this.chatService.registerDeviceKey(payload.id, dto);
    }

    @Get("e2ee/users/:userId/keys")
    @HttpCode(200)
    @ResponseMessage("User device keys fetched successfully")
    async getUserDeviceKeys(@Param("userId") userId: string) {
        return this.chatService.getUserDeviceKeys(userId);
    }

    @Delete("e2ee/device-key/:deviceId")
    @HttpCode(200)
    @ResponseMessage("Device key deactivated successfully")
    async deactivateDeviceKey(
        @Req() request: Request,
        @Param("deviceId") deviceId: string,
    ) {
        const payload = request["payload"] as TokenPayload;
        return this.chatService.deactivateDeviceKey(payload.id, deviceId);
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
    @ResponseMessage("User info fetched successfully")
    async startConversationByPlate(
        @Req() request: Request,
        @Body("plate_no") plate_no: string
    ) {
        const payload = request["payload"] as TokenPayload;
        return this.chatService.getOrCreateRoomByPlate(payload.id, plate_no);
    }
}
