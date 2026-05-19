import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req, BadRequestException, Inject } from "@nestjs/common";
import { NotificationService } from "./notification.service";
import { CreateNotificationDto } from "./dtos/create-notification.dto";
import { ResponseMessage } from "src/common/decorators/apiResponseMessage.decorator";
import { PaginationDto } from "src/common/dtos/pagination.dto";
import { TokenPayload } from "../auth/types/TokenPayload.type";
import { plainToInstance } from "class-transformer";
import { Roles } from "src/common/decorators/role.decorator";
import { UserRole } from "generated/prisma/enums";
import { UserNotificationsResponseDto } from "./dtos/user-notifications-reponse.dto";
import { NotificationEventService } from "./services/notification-event.service";
import { NotificationPreferenceService } from "./services/notification-preference.service";
import { NotificationDispatcherService } from "./services/notification-dispatcher.service";
import { UpdateNotificationPreferenceDto, UpdateUserLocationDto } from "./dtos/notification-event.dto";
import { SendLocationNotificationDto, LocationNotificationResponse } from "./dtos/send-location-notification.dto";
import { SMTPProvider } from "src/common/providres/smtp.provider";

@Controller({
    path: "notifications"
})
export class NotificationController {

    constructor(
        private readonly notificationService: NotificationService,
        private readonly notificationEventService: NotificationEventService,
        private readonly notificationPreferenceService: NotificationPreferenceService,
        private readonly notificationDispatcherService: NotificationDispatcherService,
        private readonly smtpProvider: SMTPProvider,
    ) { }

    /**
     * Create and send notification (Admin/Internal use)
     */
    @Post()
    @ResponseMessage("notification created successfully")
    async createNotification(@Body() createNotificationDto: CreateNotificationDto) {
        const createdNotification = await this.notificationService.createNotification(createNotificationDto)
        return createdNotification
    }

    /**
     * Get user's notification events with pagination
     */
    @Get("events")
    @ResponseMessage("notification events fetched successfully")
    async getNotificationEvents(
        @Req() request: any,
        @Query() pagination: PaginationDto,
        @Query('unreadOnly') unreadOnly: string = 'false'
    ) {
        const tokenPayload = request['payload'] as TokenPayload;
        const result = await this.notificationEventService.getEventsByUser(
            tokenPayload.id,
            pagination,
            unreadOnly === 'true'
        );
        return result;
    }

    /**
     * Get specific notification event
     */
    @Get("events/:id")
    @ResponseMessage("notification event fetched successfully")
    async getNotificationEvent(
        @Req() request: any,
        @Param('id') eventId: string
    ) {
        const tokenPayload = request['payload'] as TokenPayload;
        const event = await this.notificationEventService.getEventById(eventId);
        
        // Verify ownership
        if (event.userId !== tokenPayload.id) {
            throw new Error('Unauthorized');
        }

        return event;
    }

    /**
     * Mark single notification as read
     */
    @Patch("events/:id/read")
    @ResponseMessage("notification marked as read")
    async markNotificationAsRead(
        @Req() request: any,
        @Param('id') eventId: string
    ) {
        const tokenPayload = request['payload'] as TokenPayload;
        return await this.notificationEventService.markAsRead(eventId, tokenPayload.id);
    }

    /**
     * Mark all notifications as read
     */
    @Patch("read-all")
    @ResponseMessage("all notifications marked as read")
    async markAllNotificationsAsRead(@Req() request: any) {
        const tokenPayload = request['payload'] as TokenPayload;
        return await this.notificationEventService.markAllAsRead(tokenPayload.id);
    }

    /**
     * Delete notification event
     */
    @Delete("events/:id")
    @ResponseMessage("notification deleted successfully")
    async deleteNotification(
        @Req() request: any,
        @Param('id') eventId: string
    ) {
        const tokenPayload = request['payload'] as TokenPayload;
        await this.notificationEventService.deleteEvent(eventId, tokenPayload.id);
        return { success: true };
    }

    /**
     * Delete all notifications for user
     */
    @Delete("events")
    @ResponseMessage("all notifications deleted successfully")
    async deleteAllNotifications(@Req() request: any) {
        const tokenPayload = request['payload'] as TokenPayload;
        return await this.notificationEventService.deleteAllEvents(tokenPayload.id);
    }

    /**
     * Get user's notification preferences
     */
    @Get("preferences")
    @ResponseMessage("notification preferences fetched successfully")
    async getPreferences(@Req() request: any) {
        const tokenPayload = request['payload'] as TokenPayload;
        return await this.notificationPreferenceService.getPreferences(tokenPayload.id);
    }

    /**
     * Update user's notification preferences
     */
    @Put("preferences")
    @ResponseMessage("notification preferences updated successfully")
    async updatePreferences(
        @Req() request: any,
        @Body() updateDto: UpdateNotificationPreferenceDto
    ) {
        const tokenPayload = request['payload'] as TokenPayload;
        return await this.notificationPreferenceService.updatePreferences(tokenPayload.id, updateDto);
    }

    /**
     * Update user's current location
     */
    @Post("location")
    @ResponseMessage("user location updated successfully")
    async updateUserLocation(
        @Req() request: any,
        @Body() updateLocationDto: UpdateUserLocationDto
    ) {
        const tokenPayload = request['payload'] as TokenPayload;
        
        // Validate coordinates
        const geolocationService = new (require('../../common/services/geolocation.service').GeolocationService)(null);
        if (!geolocationService.validateCoordinates(updateLocationDto.latitude, updateLocationDto.longitude)) {
            throw new Error('Invalid coordinates');
        }

        return await geolocationService.updateUserLocation(
            tokenPayload.id,
            updateLocationDto.latitude,
            updateLocationDto.longitude,
            updateLocationDto.accuracy
        );
    }

    /**
     * Get user's current location
     */
    @Get("location")
    @ResponseMessage("user location fetched successfully")
    async getUserLocation(@Req() request: any) {
        const tokenPayload = request['payload'] as TokenPayload;
        const geolocationService = new (require('../../common/services/geolocation.service').GeolocationService)(null);
        return await geolocationService.getUserLocation(tokenPayload.id);
    }

    /**
     * Get unread notification count
     */
    @Get("count/unread")
    @ResponseMessage("unread notification count fetched successfully")
    async getUnreadCount(@Req() request: any) {
        const tokenPayload = request['payload'] as TokenPayload;
        const result = await this.notificationEventService.getEventsByUser(
            tokenPayload.id,
            { page: 1, limit: 1 },
            true
        );
        return { unreadCount: result.unreadCount };
    }

    /**
     * Send location-based notification to all users within radius (Admin only)
     * Sends both push notifications and emails to users in the specified area
     */
    @Post("send-location-based")
    @Roles(UserRole.ADMIN)
    @ResponseMessage("location-based notification sent successfully")
    async sendLocationBasedNotification(
        @Req() request: any,
        @Body() sendLocationNotificationDto: SendLocationNotificationDto
    ): Promise<LocationNotificationResponse> {
        const tokenPayload = request['payload'] as TokenPayload;

        // Verify admin role
        if (tokenPayload.role !== UserRole.ADMIN) {
            throw new BadRequestException("Only administrators can send location-based notifications");
        }

        try {
            const result = await this.notificationDispatcherService.dispatchLocationNotification(
                sendLocationNotificationDto.latitude,
                sendLocationNotificationDto.longitude,
                sendLocationNotificationDto.radiusInKm,
                sendLocationNotificationDto.title,
                sendLocationNotificationDto.message,
                sendLocationNotificationDto.emailSubject,
                sendLocationNotificationDto.sendEmail,
                sendLocationNotificationDto.sendPushNotification,
                this.smtpProvider,
            );

            return {
                success: true,
                totalUsersFound: result.totalUsersFound,
                notificationsSent: result.notificationsSent,
                emailsSent: result.emailsSent,
                failedCount: result.failedCount,
                message: `Notifications sent successfully to ${result.notificationsSent} users via push notification and ${result.emailsSent} users via email`,
            };
        } catch (error: any) {
            throw new BadRequestException(
                `Failed to send location-based notifications: ${error.message}`
            );
        }
    }
}