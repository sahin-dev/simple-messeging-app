import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateNotificationEventDto, NotificationEventTypeEnum } from '../dtos/notification-event.dto';
import { PaginationDto } from '../../../common/dtos/pagination.dto';

@Injectable()
export class NotificationEventService {
  constructor(private readonly prismaService: PrismaService) {}

  /**
   * Create a notification event for a user
   */
  async createEvent(
    createNotificationEventDto: CreateNotificationEventDto,
  ): Promise<any> {
    const user = await this.prismaService.user.findFirst({
      where: { id: createNotificationEventDto.userId },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    const event = await this.prismaService.notificationEvent.create({
      data: {
        userId: createNotificationEventDto.userId,
        eventType: createNotificationEventDto.eventType as any,
        title: createNotificationEventDto.title,
        message: createNotificationEventDto.message,
        payload: createNotificationEventDto.payload
          ? JSON.stringify(createNotificationEventDto.payload)
          : null,
      },
    });

    return this.formatEventResponse(event);
  }

  /**
   * Bulk create notification events for multiple users
   */
  async bulkCreateEvents(
    userIds: string[],
    eventType: NotificationEventTypeEnum,
    title: string,
    message: string,
    payload?: Record<string, any>,
  ): Promise<any[]> {
    const events = await Promise.all(
      userIds.map((userId) =>
        this.createEvent({
          userId,
          eventType,
          title,
          message,
          payload,
        }).catch((err) => {
          console.error(`Failed to create notification for user ${userId}:`, err);
          return null;
        }),
      ),
    );

    return events.filter((e) => e !== null);
  }

  /**
   * Get notification events for a user with pagination
   */
  async getEventsByUser(
    userId: string,
    pagination: PaginationDto,
    unreadOnly: boolean = false,
  ): Promise<{ events: any[]; total: number; unreadCount: number }> {
    const skip = (pagination.page - 1) * pagination.limit;

    const whereClause: any = { userId };
    if (unreadOnly) {
      whereClause.isRead = false;
    }

    const [events, total, unreadCount] = await Promise.all([
      this.prismaService.notificationEvent.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pagination.limit,
      }),
      this.prismaService.notificationEvent.count({
        where: whereClause,
      }),
      this.prismaService.notificationEvent.count({
        where: { userId, isRead: false },
      }),
    ]);

    return {
      events: events.map((e) => this.formatEventResponse(e)),
      total,
      unreadCount,
    };
  }

  /**
   * Get a specific notification event
   */
  async getEventById(eventId: string): Promise<any> {
    const event = await this.prismaService.notificationEvent.findUnique({
      where: { id: eventId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            nick_name: true,
          },
        },
      },
    });

    if (!event) {
      throw new NotFoundException('Notification event not found');
    }

    return this.formatEventResponse(event);
  }

  /**
   * Mark a notification event as read
   */
  async markAsRead(eventId: string, userId: string): Promise<any> {
    const event = await this.prismaService.notificationEvent.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      throw new NotFoundException('Notification event not found');
    }

    if (event.userId !== userId) {
      throw new BadRequestException(
        'You do not have permission to update this notification',
      );
    }

    const updatedEvent = await this.prismaService.notificationEvent.update({
      where: { id: eventId },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return this.formatEventResponse(updatedEvent);
  }

  /**
   * Mark all notifications for a user as read
   */
  async markAllAsRead(userId: string): Promise<{ updatedCount: number }> {
    const result = await this.prismaService.notificationEvent.updateMany({
      where: {
        userId,
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return { updatedCount: result.count };
  }

  /**
   * Delete a notification event
   */
  async deleteEvent(eventId: string, userId: string): Promise<void> {
    const event = await this.prismaService.notificationEvent.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      throw new NotFoundException('Notification event not found');
    }

    if (event.userId !== userId) {
      throw new BadRequestException(
        'You do not have permission to delete this notification',
      );
    }

    await this.prismaService.notificationEvent.delete({
      where: { id: eventId },
    });
  }

  /**
   * Delete all notifications for a user
   */
  async deleteAllEvents(userId: string): Promise<{ deletedCount: number }> {
    const result = await this.prismaService.notificationEvent.deleteMany({
      where: { userId },
    });

    return { deletedCount: result.count };
  }

  /**
   * Get notifications by event type
   */
  async getEventsByType(
    userId: string,
    eventType: NotificationEventTypeEnum,
    pagination: PaginationDto,
  ): Promise<{ events: any[]; total: number }> {
    const skip = (pagination.page - 1) * pagination.limit;

    const [events, total] = await Promise.all([
      this.prismaService.notificationEvent.findMany({
        where: {
          userId,
          eventType: eventType as any,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pagination.limit,
      }),
      this.prismaService.notificationEvent.count({
        where: {
          userId,
          eventType: eventType as any,
        },
      }),
    ]);

    return {
      events: events.map((e) => this.formatEventResponse(e)),
      total,
    };
  }

  /**
   * Clean up old notification events (older than specified days)
   */
  async cleanupOldNotifications(daysOld: number = 30): Promise<{ deletedCount: number }> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const result = await this.prismaService.notificationEvent.deleteMany({
      where: {
        createdAt: {
          lt: cutoffDate,
        },
      },
    });

    return { deletedCount: result.count };
  }

  /**
   * Format notification event response
   */
  private formatEventResponse(event: any): any {
    return {
      ...event,
      payload: event.payload ? JSON.parse(event.payload) : null,
    };
  }
}
