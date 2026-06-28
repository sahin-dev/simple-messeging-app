import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SMTPProvider } from "src/common/providres/smtp.provider";
import { CreateSupportTicketDto } from "./dtos/create-support-ticket.dto";
import { ReplySupportTicketDto } from "./dtos/reply-support-ticket.dto";

@Injectable()
export class HelpSupportService {
    constructor(
        private readonly prismaService: PrismaService,
        private readonly smtpProvider: SMTPProvider,
    ) {}

    async createTicket(userId: string, dto: CreateSupportTicketDto) {
        return this.prismaService.supportTicket.create({
            data: {
                userId,
                subject: dto.subject,
                description: dto.description,
            },
            include: {
                user: {
                    select: {
                        id: true,
                        nick_name: true,
                        email: true,
                    },
                },
            },
        });
    }

    async getAllTickets() {
        return this.prismaService.supportTicket.findMany({
            include: {
                user: {
                    select: {
                        id: true,
                        nick_name: true,
                        email: true,
                    },
                },
            },
            orderBy: {
                createdAt: "desc",
            },
        });
    }

    async replyToTicket(ticketId: string, dto: ReplySupportTicketDto) {
        const ticket = await this.prismaService.supportTicket.findUnique({
            where: { id: ticketId },
            include: {
                user: {
                    select: {
                        id: true,
                        nick_name: true,
                        email: true,
                    },
                },
            },
        });

        if (!ticket) {
            throw new NotFoundException("Support ticket not found");
        }

        const updatedTicket = await this.prismaService.supportTicket.update({
            where: { id: ticketId },
            data: {
                adminReply: dto.reply,
            },
            include: {
                user: {
                    select: {
                        id: true,
                        nick_name: true,
                        email: true,
                    },
                },
            },
        });

        if (ticket.user && ticket.user.email) {
            const emailBody = `
                <div style="font-family: Arial, sans-serif; padding: 20px; line-height: 1.6;">
                    <h2>Support Ticket Response</h2>
                    <p>Hello <strong>${ticket.user.nick_name || "User"}</strong>,</p>
                    <p>We have responded to your support ticket regarding: <em>"${ticket.subject}"</em>.</p>
                    <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
                    <p><strong>Your Message:</strong></p>
                    <blockquote style="background: #f9f9f9; border-left: 5px solid #ccc; padding: 10px; margin: 0 0 20px 0;">
                        ${ticket.description}
                    </blockquote>
                    <p><strong>Admin Response:</strong></p>
                    <blockquote style="background: #f0f8ff; border-left: 5px solid #008080; padding: 10px; margin: 0 0 20px 0;">
                        ${dto.reply}
                    </blockquote>
                    <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
                    <p>Best regards,<br/>Support Team</p>
                </div>
            `;

            await this.smtpProvider.sendMail(
                ticket.user.email,
                `Support Ticket Response: ${ticket.subject}`,
                emailBody
            );
        }

        return updatedTicket;
    }
}
