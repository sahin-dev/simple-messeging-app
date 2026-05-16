import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateNotificationPreferenceDto } from '../dtos/notification-event.dto';

@Injectable()
export class NotificationPreferenceService {
  constructor(private readonly prismaService: PrismaService) {}

  /**
   * Get user's notification preferences
   * Creates default preferences if they don't exist
   */
  async getPreferences(userId: string): Promise<any> {
    let preferences = await this.prismaService.notificationPreference.findUnique({
      where: { userId },
    });

    if (!preferences) {
      // Create default preferences
      preferences = await this.createDefaultPreferences(userId);
    }

    return preferences;
  }

  /**
   * Create default notification preferences for a user
   */
  async createDefaultPreferences(userId: string): Promise<any> {
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    return this.prismaService.notificationPreference.create({
      data: {
        userId,
        parkingNotifications: true,
        chatNotifications: true,
        ratingNotifications: true,
        groupChatNotifications: true,
        systemNotifications: true,
        notificationRadius: 200,
      },
    });
  }

  /**
   * Update user's notification preferences
   */
  async updatePreferences(
    userId: string,
    updatePreferenceDto: UpdateNotificationPreferenceDto,
  ): Promise<any> {
    const preferences = await this.getPreferences(userId);

    // Validate radius if provided
    if (updatePreferenceDto.notificationRadius !== undefined) {
      if (updatePreferenceDto.notificationRadius < 50 || updatePreferenceDto.notificationRadius > 5000) {
        throw new BadRequestException(
          'Notification radius must be between 50 and 5000 meters',
        );
      }
    }

    return this.prismaService.notificationPreference.update({
      where: { userId },
      data: updatePreferenceDto,
    });
  }

  /**
   * Check if a specific notification type is enabled for a user
   */
  async isNotificationEnabled(
    userId: string,
    notificationType: string,
  ): Promise<boolean> {
    const preferences = await this.getPreferences(userId);

    const typeKey = `${notificationType}Notifications`;
    if (typeKey in preferences) {
      return preferences[typeKey];
    }

    return true; // Default to enabled if type not recognized
  }

  /**
   * Check if parking notifications are enabled and within radius
   */
  async shouldNotifyForParking(
    userId: string,
    distance: number,
  ): Promise<boolean> {
    const isEnabled = await this.isNotificationEnabled(userId, 'parking');
    if (!isEnabled) {
      return false;
    }

    const preferences = await this.getPreferences(userId);
    return distance <= preferences.notificationRadius;
  }

  /**
   * Get notification radius for a user
   */
  async getNotificationRadius(userId: string): Promise<number> {
    const preferences = await this.getPreferences(userId);
    return preferences.notificationRadius;
  }

  /**
   * Set notification radius for a user
   */
  async setNotificationRadius(userId: string, radius: number): Promise<any> {
    if (radius < 50 || radius > 5000) {
      throw new BadRequestException(
        'Notification radius must be between 50 and 5000 meters',
      );
    }

    return this.updatePreferences(userId, { notificationRadius: radius });
  }

  /**
   * Disable all notifications for a user
   */
  async disableAllNotifications(userId: string): Promise<any> {
    return this.updatePreferences(userId, {
      parkingNotifications: false,
      chatNotifications: false,
      ratingNotifications: false,
      groupChatNotifications: false,
      systemNotifications: false,
    });
  }

  /**
   * Enable all notifications for a user
   */
  async enableAllNotifications(userId: string): Promise<any> {
    return this.updatePreferences(userId, {
      parkingNotifications: true,
      chatNotifications: true,
      ratingNotifications: true,
      groupChatNotifications: true,
      systemNotifications: true,
    });
  }

  /**
   * Get all users who have parking notifications enabled
   */
  async getUsersWithParkingNotificationsEnabled(): Promise<string[]> {
    const preferences = await this.prismaService.notificationPreference.findMany({
      where: { parkingNotifications: true },
      select: { userId: true },
    });

    return preferences.map((p) => p.userId);
  }
}
