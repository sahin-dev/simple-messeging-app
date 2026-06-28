import { Controller, Post, Get, Body, Param, HttpCode, HttpStatus } from "@nestjs/common";
import { HelpSupportService } from "./help-support.service";
import { CreateSupportTicketDto } from "./dtos/create-support-ticket.dto";
import { ReplySupportTicketDto } from "./dtos/reply-support-ticket.dto";
import { ResponseMessage } from "src/common/decorators/apiResponseMessage.decorator";
import { GetUser } from "src/common/decorators";
import { Roles } from "src/common/decorators/role.decorator";
import { UserRole } from "generated/prisma/enums";

@Controller("help-support")
export class HelpSupportController {
    constructor(private readonly helpSupportService: HelpSupportService) {}

    /**
     * Submit a support ticket
     */
    @Post()
    @HttpCode(HttpStatus.CREATED)
    @ResponseMessage("Support ticket submitted successfully")
    async createTicket(
        @GetUser("id") userId: string,
        @Body() createDto: CreateSupportTicketDto,
    ) {
        return this.helpSupportService.createTicket(userId, createDto);
    }

    /**
     * Get all support tickets (Admin only)
     */
    @Get()
    @Roles(UserRole.ADMIN)
    @ResponseMessage("Support tickets fetched successfully")
    async getAllTickets() {
        return this.helpSupportService.getAllTickets();
    }

    /**
     * Reply to a support ticket (Admin only)
     */
    @Post(":id/reply")
    @Roles(UserRole.ADMIN)
    @HttpCode(HttpStatus.OK)
    @ResponseMessage("Response sent successfully")
    async replyToTicket(
        @Param("id") ticketId: string,
        @Body() replyDto: ReplySupportTicketDto,
    ) {
        return this.helpSupportService.replyToTicket(ticketId, replyDto);
    }
}
