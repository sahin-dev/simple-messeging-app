import { Injectable, Logger, Inject, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { GeolocationService } from '../../../common/services/geolocation.service';
import { NotificationEventService } from './notification-event.service';
import { NotificationPreferenceService } from './notification-preference.service';
import { FireBaseClient } from '../providers/firebase.provider';
import { NotificationEventTypeEnum } from '../dtos/notification-event.dto';

@Injectable()
export class NotificationDispatcherService {
  private readonly logger = new Logger(NotificationDispatcherService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly geolocationService: GeolocationService,
    private readonly notificationEventService: NotificationEventService,
    private readonly notificationPreferenceService: NotificationPreferenceService,
    private readonly firebaseClient: FireBaseClient,
    @Optional()
    @Inject('SOCKET_ROOM_SERVICE')
    private readonly socketRoomService?: any,
  ) {}

  /**
   * Check if a user is currently connected via socket
   * Returns false if socket service is unavailable
   */
  private async isUserOnline(userId: string): Promise<boolean> {
    if (!this.socketRoomService) return false;
    try {
      return await this.socketRoomService.isUserConnected(userId);
    } catch {
      return false;
    }
  }

  /**
   * Dispatch parking availability notification to users within radius
   * This is the main use case for the notification system
   * Credit System:
   * - First notification is FREE for every user
   * - User earns 1 credit when notifying others they are leaving a parking spot
   * - Each notification received consumes 1 credit
   */
  async dispatchParkingNotification(parkingReport: any): Promise<void> {
    try {
      this.logger.log(
        `Dispatching parking notification for report ${parkingReport.id}`,
      );

      // Find users within radius (excluding the reporter)
      const usersInRadius = await this.geolocationService.findUsersWithinRadius(
        parkingReport.latitude,
        parkingReport.longitude,
        200, // 200 meters radius
        parkingReport.user_id, // Exclude the reporter
      );

      this.logger.log(
        `Found ${usersInRadius.length} users within radius for parking ${parkingReport.id}`,
      );

      // Send notifications to eligible users
      for (const user of usersInRadius) {
        try {
          // Check if user has parking notifications enabled and within their preferred radius
          const shouldNotify =
            await this.notificationPreferenceService.shouldNotifyForParking(
              user.id,
              // We need to calculate actual distance for this user
              await this.getDistanceForUser(user.id, parkingReport),
            );

          if (!shouldNotify || !user.fcm_token) {
            this.logger.debug(`Skipping notification for user ${user.id}`);
            continue;
          }

          // Check if user has parking notification credits available
          const hasCredits = await this.checkParkingNotificationCredits(user.id);

          if (!hasCredits) {
            this.logger.debug(
              `User ${user.id} has no parking notification credits available`,
            );
            continue;
          }

          // Consume credit and send notification
          const creditConsumed = await this.consumeParkingNotificationCredit(
            user.id,
            parkingReport.id,
          );

          if (!creditConsumed) {
            this.logger.warn(
              `Failed to consume credit for user ${user.id}, skipping notification`,
            );
            continue;
          }

          // Build notification message
          const title = 'Parking Available!';
          const message = this.buildParkingNotificationMessage(parkingReport);
          const payload = {
            parkingReportId: parkingReport.id,
            latitude: parkingReport.latitude,
            longitude: parkingReport.longitude,
            parkingCost: parkingReport.parking_cost,
            hasCharging: parkingReport.electric_charging,
            hasDisabledFacility: parkingReport.disabled_facility,
            reporterName: parkingReport.user?.name || parkingReport.user?.nick_name,
          };

          // Create notification event
          await this.notificationEventService.createEvent({
            userId: user.id,
            eventType: NotificationEventTypeEnum.PARKING_AVAILABLE,
            title,
            message,
            payload,
          });

          // Send push notification via FCM only if user is not online
          const isOnline = await this.isUserOnline(user.id);
          if (!isOnline) {
            await this.sendPushNotification(user.fcm_token, title, message);
          } else {
            this.logger.debug(`Skipping push notification for online user ${user.id}`);
          }

          this.logger.log(
            `Sent parking notification to user ${user.id}`,
          );
        } catch (err) {
          this.logger.error(
            `Failed to send notification to user ${user.id}:`,
            err,
          );
        }
      }
    } catch (err) {
      this.logger.error(
        `Error dispatching parking notifications for report ${parkingReport.id}:`,
        err,
      );
    }
  }

  /**
   * Dispatch parking leave notification to users within 200m radius.
   * Receivers must have notification credits; each notification consumes 1 credit.
   */
  async dispatchParkingLeaveNotification(
    spot: any,
    leavingUser: { id: string; name: string | null; nick_name: string } | null,
    referenceId: string,
  ): Promise<void> {
    try {
      this.logger.log(`Dispatching parking leave notification for spot ${spot.id}`);

      const usersInRadius = await this.geolocationService.findUsersWithinRadius(
        spot.latitude,
        spot.longitude,
        200,
        leavingUser?.id,
      );

      this.logger.log(
        `Found ${usersInRadius.length} users within 200m for leaving spot ${spot.id}`,
      );

      const leaverName = leavingUser?.nick_name || leavingUser?.name || 'A user';

      for (const user of usersInRadius) {
        try {
          const distance = await this.getDistanceForUser(user.id, spot);

          const shouldNotify = await this.notificationPreferenceService.shouldNotifyForParking(
            user.id,
            distance,
          );

          if (!shouldNotify || !user.fcm_token) {
            continue;
          }

          const hasCredits = await this.checkParkingNotificationCredits(user.id);
          if (!hasCredits) {
            this.logger.debug(`User ${user.id} has no credits for leave notification`);
            continue;
          }

          const creditConsumed = await this.consumeParkingNotificationCredit(user.id, referenceId);
          if (!creditConsumed) {
            continue;
          }

          const title = 'Parking Spot Opening Up!';
          const message = `${leaverName} is leaving a parking spot nearby`;
          const payload = {
            spotId: spot.id,
            latitude: spot.latitude,
            longitude: spot.longitude,
            parkingCost: spot.parking_cost,
            hasCharging: spot.electric_charging,
            hasDisabledFacility: spot.disabled_facility,
            leaverName,
            type: 'PARKING_LEAVING',
          };

          await this.notificationEventService.createEvent({
            userId: user.id,
            eventType: NotificationEventTypeEnum.PARKING_NEARBY,
            title,
            message,
            payload,
          });

          const isOnline = await this.isUserOnline(user.id);
          if (!isOnline) {
            await this.sendPushNotification(user.fcm_token, title, message);
          } else {
            this.logger.debug(`Skipping push notification for online user ${user.id}`);
          }

          this.logger.log(`Sent parking leave notification to user ${user.id}`);
        } catch (err) {
          this.logger.error(`Failed to send leave notification to user ${user.id}:`, err);
        }
      }
    } catch (err) {
      this.logger.error(`Error dispatching parking leave notifications for spot ${spot.id}:`, err);
    }
  }

  /**
   * Dispatch chat message notification
   */
  async dispatchChatNotification(
    chat: any,
    receiverId: string,
  ): Promise<void> {
    try {
      const isEnabled =
        await this.notificationPreferenceService.isNotificationEnabled(
          receiverId,
          'chat',
        );

      if (!isEnabled) {
        return;
      }

      const receiver = await this.prismaService.user.findUnique({
        where: { id: receiverId },
      });

      if (!receiver || !receiver.fcm_token) {
        return;
      }

      const isEncrypted = Boolean(chat.encryptionType);
      const title = isEncrypted
        ? 'New message'
        : `Message from ${chat.sender?.nick_name || chat.sender?.name}`;
      const message = isEncrypted
        ? 'You received an encrypted message'
        : (chat.message || '').substring(0, 100);

      // If the receiver is online, skip both the notification event and push notification
      const isOnline = await this.isUserOnline(receiverId);
      if (isOnline) {
        this.logger.debug(`Skipping chat notification for online user ${receiverId}`);
        return;
      }

      await this.notificationEventService.createEvent({
        userId: receiverId,
        eventType: NotificationEventTypeEnum.CHAT_MESSAGE,
        title,
        message,
        payload: {
          chatId: chat.id,
          senderId: chat.sender_id,
          senderName: chat.sender?.nick_name || chat.sender?.name,
        },
      });

      await this.sendPushNotification(receiver.fcm_token, title, message);

      this.logger.log(`Sent chat notification to user ${receiverId}`);
    } catch (err) {
      this.logger.error(`Failed to dispatch chat notification:`, err);
    }
  }

  /**
   * Dispatch rating received notification
   */
  async dispatchRatingNotification(rating: any): Promise<void> {
    try {
      const isEnabled =
        await this.notificationPreferenceService.isNotificationEnabled(
          rating.ratee_id,
          'rating',
        );

      if (!isEnabled) {
        return;
      }

      const rater = await this.prismaService.user.findUnique({
        where: { id: rating.rater_id },
      });

      const ratee = await this.prismaService.user.findUnique({
        where: { id: rating.ratee_id },
      });

      if (!ratee || !ratee.fcm_token) {
        return;
      }

      const title = 'New Rating Received!';
      const message = `${rater?.nick_name || rater?.name} gave you a ${rating.rating} star rating`;

      await this.notificationEventService.createEvent({
        userId: rating.ratee_id,
        eventType: NotificationEventTypeEnum.RATING_RECEIVED,
        title,
        message,
        payload: {
          ratingId: rating.id,
          ratingScore: rating.rating,
          raterName: rater?.nick_name || rater?.name,
        },
      });

      const isOnline = await this.isUserOnline(rating.ratee_id);
      if (!isOnline) {
        await this.sendPushNotification(ratee.fcm_token, title, message);
      } else {
        this.logger.debug(`Skipping push notification for online user ${rating.ratee_id}`);
      }

      this.logger.log(`Sent rating notification to user ${rating.ratee_id}`);
    } catch (err) {
      this.logger.error(`Failed to dispatch rating notification:`, err);
    }
  }

  /**
   * Dispatch group chat message notification
   */
  async dispatchGroupChatNotification(groupChat: any, groupChatRoom: any): Promise<void> {
    try {
      // Get all members of the group chat except the sender
      const members = await this.prismaService.groupChatRoomMember.findMany({
        where: {
          groupChatRoom_id: groupChatRoom.id,
          user_id: {
            not: groupChat.sender_id,
          },
        },
        include: {
          user: true,
        },
      });

      for (const member of members) {
        try {
          const isEnabled =
            await this.notificationPreferenceService.isNotificationEnabled(
              member.user_id,
              'groupChat',
            );

          if (!isEnabled || !member.user.fcm_token) {
            continue;
          }

          const isEncrypted = Boolean(groupChat.encryptionType);
          const title = `${groupChatRoom.name}`;
          const message = isEncrypted
            ? `${groupChat.sender?.nick_name || groupChat.sender?.name}: sent an encrypted message`
            : `${groupChat.sender?.nick_name || groupChat.sender?.name}: ${groupChat.message.substring(0, 50)}`;

          // Skip notification event and push if member is online
          const isOnline = await this.isUserOnline(member.user_id);
          if (isOnline) {
            this.logger.debug(`Skipping group chat notification for online user ${member.user_id}`);
            continue;
          }

          await this.notificationEventService.createEvent({
            userId: member.user_id,
            eventType: NotificationEventTypeEnum.GROUP_CHAT_MESSAGE,
            title,
            message,
            payload: {
              groupChatRoomId: groupChatRoom.id,
              groupChatId: groupChat.id,
              senderId: groupChat.sender_id,
            },
          });

          await this.sendPushNotification(member.user.fcm_token, title, message);
        } catch (err) {
          this.logger.error(
            `Failed to send group chat notification to user ${member.user_id}:`,
            err,
          );
        }
      }
    } catch (err) {
      this.logger.error(`Failed to dispatch group chat notifications:`, err);
    }
  }

  /**
   * Dispatch system notification to multiple users
   */
  async dispatchSystemNotification(
    userIds: string[],
    title: string,
    message: string,
    payload?: any,
  ): Promise<void> {
    try {
      for (const userId of userIds) {
        try {
          const isEnabled =
            await this.notificationPreferenceService.isNotificationEnabled(
              userId,
              'system',
            );

          if (!isEnabled) {
            continue;
          }

          const user = await this.prismaService.user.findUnique({
            where: { id: userId },
          });

          if (!user || !user.fcm_token) {
            continue;
          }

          await this.notificationEventService.createEvent({
            userId,
            eventType: NotificationEventTypeEnum.SYSTEM_NOTIFICATION,
            title,
            message,
            payload,
          });

          const isOnline = await this.isUserOnline(userId);
          if (!isOnline) {
            await this.sendPushNotification(user.fcm_token, title, message);
          } else {
            this.logger.debug(`Skipping push notification for online user ${userId}`);
          }
        } catch (err) {
          this.logger.error(
            `Failed to send system notification to user ${userId}:`,
            err,
          );
        }
      }
    } catch (err) {
      this.logger.error(`Failed to dispatch system notifications:`, err);
    }
  }

  /**
   * Dispatch location-based notification to users within radius
   * Admin endpoint for sending notifications to all users in a specified area
   * @param latitude - Center latitude
   * @param longitude - Center longitude
   * @param radiusKm - Radius in kilometers
   * @param title - Notification title
   * @param message - Notification message
   * @param emailSubject - Email subject (optional)
   * @param sendEmail - Whether to send email (default: true)
   * @param sendPushNotification - Whether to send push notification (default: true)
   * @param smtpProvider - SMTP provider for email sending
   * @returns Statistics about notifications sent
   */
  async dispatchLocationNotification(
    latitude: number,
    longitude: number,
    radiusKm: number,
    title: string,
    message: string,
    emailSubject?: string,
    sendEmail: boolean = true,
    sendPushNotification: boolean = true,
    smtpProvider?: any,
  ): Promise<{
    totalUsersFound: number;
    notificationsSent: number;
    emailsSent: number;
    failedCount: number;
  }> {
    const radiusMeters = radiusKm * 1000; // Convert km to meters
    let notificationsSent = 0;
    let emailsSent = 0;
    let failedCount = 0;

    try {
      this.logger.log(
        `Dispatching location-based notification. Location: (${latitude}, ${longitude}), Radius: ${radiusKm}km`,
      );

      // Find users within radius
      const usersInRadius = await this.geolocationService.findUsersWithinRadius(
        latitude,
        longitude,
        radiusMeters,
      );

      this.logger.log(
        `Found ${usersInRadius.length} users within ${radiusKm}km radius`,
      );

      // Send notifications to each user
      for (const user of usersInRadius) {
        try {
          // Check if system notifications are enabled for user
          const isEnabled =
            await this.notificationPreferenceService.isNotificationEnabled(
              user.id,
              'system',
            );

          if (!isEnabled) {
            this.logger.debug(
              `System notifications disabled for user ${user.id}`,
            );
            continue;
          }

          let sent = false;

          // Send push notification if FCM token exists and enabled and user is not online
          if (sendPushNotification && user.fcm_token) {
            const userIsOnline = await this.isUserOnline(user.id);
            if (userIsOnline) {
              this.logger.debug(`Skipping push notification for online user ${user.id}`);
            } else {
              try {
                await this.sendPushNotification(user.fcm_token, title, message);
                notificationsSent++;
                sent = true;
                this.logger.debug(
                  `Push notification sent to user ${user.id}`,
                );
              } catch (err) {
                this.logger.error(
                  `Failed to send push notification to user ${user.id}:`,
                  err,
                );
                failedCount++;
              }
            }
          }

          // Send email if enabled and email exists
          if (sendEmail && user.email && smtpProvider) {
            try {
              const locationNotificationTemplate = require('../../../common/templates/locationNotification.template').default;
              const emailBody = locationNotificationTemplate({
                userName: user.name || user.nick_name,
                title,
                message,
                location: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
              });

              await smtpProvider.sendMail(
                user.email,
                emailSubject || title,
                emailBody,
              );
              emailsSent++;
              this.logger.debug(`Email sent to user ${user.id}`);
            } catch (err) {
              this.logger.error(
                `Failed to send email to user ${user.id}:`,
                err,
              );
              failedCount++;
            }
          }

          // Create notification event
          if (sent) {
            try {
              await this.notificationEventService.createEvent({
                userId: user.id,
                eventType: NotificationEventTypeEnum.SYSTEM_NOTIFICATION,
                title,
                message,
                payload: {
                  latitude,
                  longitude,
                  radiusKm,
                  type: 'LOCATION_BASED',
                },
              });
            } catch (err) {
              this.logger.error(
                `Failed to create notification event for user ${user.id}:`,
                err,
              );
            }
          }
        } catch (err) {
          this.logger.error(
            `Error processing notification for user ${user.id}:`,
            err,
          );
          failedCount++;
        }
      }

      this.logger.log(
        `Location-based notification dispatch completed. Sent: ${notificationsSent} push, ${emailsSent} emails, Failed: ${failedCount}`,
      );

      return {
        totalUsersFound: usersInRadius.length,
        notificationsSent,
        emailsSent,
        failedCount,
      };
    } catch (err) {
      this.logger.error(`Error dispatching location-based notifications:`, err);
      throw err;
    }
  }

  /**
   * Send push notification via Firebase Cloud Messaging
   */
  private async sendPushNotification(
    fcmToken: string,
    title: string,
    message: string,
  ): Promise<void> {
    try {
      await this.firebaseClient.sendPushNotification(fcmToken, title, message);
    } catch (err) {
      this.logger.error(`Failed to send push notification via FCM:`, err);
    }
  }

  /**
   * Build parking notification message based on parking details
   */
  private buildParkingNotificationMessage(parkingReport: any): string {
    const details:string[] = [];

    if (parkingReport.parking_cost === 'FREE') {
      details.push('🆓 Free');
    } else if (parkingReport.parking_cost === 'PAID') {
      details.push('💵 Paid');
    }

    if (parkingReport.electric_charging) {
      details.push('⚡ Charging');
    }

    if (parkingReport.disabled_facility) {
      details.push('♿ Accessible');
    }

    if (details.length > 0) {
      return `${details.join(' • ')}`;
    }

    return 'Parking spot available';
  }

  /**
   * Get distance from user to a parking location (report or spot)
   */
  private async getDistanceForUser(
    userId: string,
    location: { latitude: number; longitude: number },
  ): Promise<number> {
    const userLocation = await this.geolocationService.getUserLocation(userId);

    if (!userLocation) {
      return Infinity;
    }

    return this.geolocationService.calculateDistance(
      userLocation.latitude,
      userLocation.longitude,
      location.latitude,
      location.longitude,
    );
  }

  /**
   * Check if user has available parking notification credits
   * Credit System:
   * - User gets 1 free notification initially
   * - Each leave notification sent adds 1 credit
   * - parking_notifications_available tracks current credits
   */
  private async checkParkingNotificationCredits(userId: string): Promise<boolean> {
    try {
      const user = await this.prismaService.user.findUnique({
        where: { id: userId },
        select: {
          parking_notifications_available: true,
        },
      });

      if (!user) {
        return false;
      }

      return user.parking_notifications_available > 0;
    } catch (err) {
      this.logger.error(`Error checking parking notification credits for user ${userId}:`, err);
      return false;
    }
  }

  /**
   * Consume a parking notification credit
   * Decrements parking_notifications_available and logs the transaction
   */
  private async consumeParkingNotificationCredit(
    userId: string,
    parkingReportId: string,
  ): Promise<boolean> {
    try {
      const updatedUser = await this.prismaService.user.update({
        where: { id: userId },
        data: {
          parking_notifications_available: { decrement: 1 },
        },
      });

      // Track credit consumption transaction
      await this.prismaService.parkingNotificationCredit.create({
        data: {
          user_id: userId,
          parking_report_id: parkingReportId,
          transaction_type: 'CONSUMED',
          amount: -1,
          balance: updatedUser.parking_notifications_available,
        },
      });

      this.logger.log(
        `Parking notification credit consumed for user ${userId}. Remaining balance: ${updatedUser.parking_notifications_available}`,
      );

      return true;
    } catch (err:any) {
      this.logger.error(
        `Error consuming parking notification credit for user ${userId}: ${err.message}`,
      );
      return false;
    }
  }

  /**
   * Dispatch document expiry notification when document is expiring soon
   */
  async dispatchDocumentExpiryNotification(
    user: any,
    document: any,
    daysUntilExpiry: number,
  ): Promise<void> {
    try {
      this.logger.log(
        `Dispatching document expiry notification for user ${user.id}`,
      );

      // Check if user has notifications enabled
      const isNotificationEnabled =
        await this.notificationPreferenceService.isNotificationEnabled(user.id, 'document');

      if (!isNotificationEnabled || !user.fcm_token) {
        this.logger.debug(
          `User ${user.id} has notifications disabled or no FCM token`,
        );
        return;
      }

      // Create notification event
      const eventPayload = {
        documentId: document.id,
        documentType: document.document_type,
        expiryDate: document.expiry_date,
        daysUntilExpiry: daysUntilExpiry,
      };

      await this.notificationEventService.createEvent({
        userId: user.id,
        eventType: NotificationEventTypeEnum.DOCUMENT_EXPIRING_SOON,
        title: `Your ${document.document_type} Document Expiring Soon`,
        message: `Your ${document.document_type} document will expire in ${daysUntilExpiry} days. Please renew it to avoid service interruption.`,
        payload: eventPayload as Record<string, any>,
      });

      // Send FCM push notification only if user is not online
      const isOnline = await this.isUserOnline(user.id);
      if (!isOnline) {
        await this.firebaseClient.sendPushNotification(
          user.fcm_token,
          `${document.document_type} Document Expiring Soon`,
          `Your document expires in ${daysUntilExpiry} days. Please renew it now.`,
        );
      } else {
        this.logger.debug(`Skipping push notification for online user ${user.id}`);
      }

      this.logger.log(
        `Document expiry notification sent to user ${user.id} for ${document.document_type}`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to dispatch document expiry notification for user ${user.id}:`,
        err,
      );
    }
  }

  /**
   * Dispatch document expired notification when document has expired
   */
  async dispatchDocumentExpiredNotification(
    user: any,
    document: any,
  ): Promise<void> {
    try {
      this.logger.log(
        `Dispatching document expired notification for user ${user.id}`,
      );

      // Check if user has notifications enabled
      const isNotificationEnabled =
        await this.notificationPreferenceService.isNotificationEnabled(user.id, 'document');

      if (!isNotificationEnabled || !user.fcm_token) {
        this.logger.debug(
          `User ${user.id} has notifications disabled or no FCM token`,
        );
        return;
      }

      // Create notification event
      const eventPayload = {
        documentId: document.id,
        documentType: document.document_type,
        expiryDate: document.expiry_date,
      };

      await this.notificationEventService.createEvent({
        userId: user.id,
        eventType: NotificationEventTypeEnum.DOCUMENT_EXPIRED,
        title: `Your ${document.document_type} Document Has Expired`,
        message: `Your ${document.document_type} document has expired. You must renew it immediately to continue using our services.`,
        payload: eventPayload as Record<string, any>,
      });

      // Send FCM push notification only if user is not online
      const isOnline = await this.isUserOnline(user.id);
      if (!isOnline) {
        await this.firebaseClient.sendPushNotification(
          user.fcm_token,
          `⚠️ ${document.document_type} Document Expired`,
          'Your document has expired. Please renew it immediately.',
        );
      } else {
        this.logger.debug(`Skipping push notification for online user ${user.id}`);
      }

      this.logger.log(
        `Document expired notification sent to user ${user.id} for ${document.document_type}`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to dispatch document expired notification for user ${user.id}:`,
        err,
      );
    }
  }

  /**
   * Dispatch a notification to all admins in the system
   */
  async dispatchAdminNotification(
    title: string,
    message: string,
    payload?: any,
  ): Promise<void> {
    try {
      this.logger.log(`Dispatching admin notification: "${title}"`);

      // Find all admins
      const admins = await this.prismaService.user.findMany({
        where: {
          role: 'ADMIN',
          is_deleted: false,
        },
      });

      this.logger.log(`Found ${admins.length} admin users to notify`);

      for (const admin of admins) {
        try {
          const isEnabled = await this.notificationPreferenceService.isNotificationEnabled(
            admin.id,
            'system',
          );

          if (!isEnabled) {
            continue;
          }

          // Create notification event (SYSTEM_NOTIFICATION is mapped to notifications requiring review/mod)
          await this.notificationEventService.createEvent({
            userId: admin.id,
            eventType: NotificationEventTypeEnum.SYSTEM_NOTIFICATION,
            title,
            message,
            payload,
          });

          // Send push notification if token exists and admin is not online
          if (admin.fcm_token) {
            const isOnline = await this.isUserOnline(admin.id);
            if (!isOnline) {
              await this.sendPushNotification(admin.fcm_token, title, message);
            } else {
              this.logger.debug(`Skipping push notification for online admin ${admin.id}`);
            }
          }
        } catch (err) {
          this.logger.error(`Failed to send admin notification to admin user ${admin.id}:`, err);
        }
      }
    } catch (err) {
      this.logger.error('Failed to dispatch admin notification:', err);
    }
  }

  /**
   * Dispatch group added notification when a user is added to a group
   */
  async dispatchGroupAddedNotification(
    groupChatRoomId: string,
    groupRoomName: string,
    userId: string,
  ): Promise<void> {
    try {
      this.logger.log(`Dispatching group added notification for user ${userId} and room ${groupChatRoomId}`);

      const isEnabled = await this.notificationPreferenceService.isNotificationEnabled(
        userId,
        'groupChat',
      );

      if (!isEnabled) {
        return;
      }

      const user = await this.prismaService.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        return;
      }

      const title = 'Added to Group Chat';
      const message = `You have been added to the group chat "${groupRoomName}"`;

      await this.notificationEventService.createEvent({
        userId,
        eventType: NotificationEventTypeEnum.GROUP_CHAT_ADDED,
        title,
        message,
        payload: {
          groupChatRoomId,
          groupRoomName,
        },
      });

      if (user.fcm_token) {
        const isOnline = await this.isUserOnline(userId);
        if (!isOnline) {
          await this.sendPushNotification(user.fcm_token, title, message);
        } else {
          this.logger.debug(`Skipping push notification for online user ${userId}`);
        }
      }

      this.logger.log(`Sent group added notification to user ${userId}`);
    } catch (err) {
      this.logger.error(`Failed to dispatch group added notification for user ${userId}:`, err);
    }
  }

  /**
   * Dispatch group removed notification when a user is removed from a group
   */
  async dispatchGroupRemovedNotification(
    groupChatRoomId: string,
    groupRoomName: string,
    userId: string,
  ): Promise<void> {
    try {
      this.logger.log(`Dispatching group removed notification for user ${userId} and room ${groupChatRoomId}`);

      const isEnabled = await this.notificationPreferenceService.isNotificationEnabled(
        userId,
        'groupChat',
      );

      if (!isEnabled) {
        return;
      }

      const user = await this.prismaService.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        return;
      }

      const title = 'Removed from Group Chat';
      const message = `You have been removed from the group chat "${groupRoomName}"`;

      await this.notificationEventService.createEvent({
        userId,
        eventType: NotificationEventTypeEnum.GROUP_CHAT_REMOVED,
        title,
        message,
        payload: {
          groupChatRoomId,
          groupRoomName,
        },
      });

      if (user.fcm_token) {
        const isOnline = await this.isUserOnline(userId);
        if (!isOnline) {
          await this.sendPushNotification(user.fcm_token, title, message);
        } else {
          this.logger.debug(`Skipping push notification for online user ${userId}`);
        }
      }

      this.logger.log(`Sent group removed notification to user ${userId}`);
    } catch (err) {
      this.logger.error(`Failed to dispatch group removed notification for user ${userId}:`, err);
    }
  }
}
