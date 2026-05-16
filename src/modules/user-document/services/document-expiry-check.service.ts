import { Injectable, Logger } from '@nestjs/common';
import { UserDocumentService } from './user-document.service';
import { NotificationDispatcherService } from '../../notification/services/notification-dispatcher.service';

@Injectable()
export class DocumentExpiryCheckService {
  private readonly logger = new Logger(DocumentExpiryCheckService.name);

  constructor(
    private readonly userDocumentService: UserDocumentService,
    private readonly notificationDispatcher: NotificationDispatcherService,
  ) {}

  /**
   * Check for expiring documents and send notifications
   * Can be called manually or by an external scheduler
   */
  async checkExpiringDocuments() {
    try {
      this.logger.log('Starting document expiry check...');

      // Get all documents expiring within 30 days
      const expiringDocuments = await this.userDocumentService.getAllExpiringDocuments(30);

      this.logger.log(`Found ${expiringDocuments.length} documents expiring soon`);

      for (const doc of expiringDocuments) {
        try {
          const daysUntilExpiry = this.calculateDaysUntilExpiry(doc.expiry_date);

          // Send notification only if user has FCM token and is not already notified
          if ((doc.user as any).fcm_token) {
            await this.notificationDispatcher.dispatchDocumentExpiryNotification(
              doc.user,
              doc,
              daysUntilExpiry,
            );

            this.logger.debug(
              `Sent expiry notification for ${doc.document_type} document to user ${doc.user.id}`,
            );
          }
        } catch (err) {
          this.logger.error(
            `Failed to send notification for document ${doc.id}:`,
            err,
          );
        }
      }

      this.logger.log('Document expiry check completed');
    } catch (err) {
      this.logger.error('Error during document expiry check:', err);
    }
  }

  /**
   * Check for expired documents and send alerts
   */
  async checkExpiredDocuments() {
    try {
      this.logger.log('Starting expired document check...');

      const expiredDocuments = await this.userDocumentService.getAllExpiredDocuments();

      this.logger.log(`Found ${expiredDocuments.length} expired documents`);

      for (const doc of expiredDocuments) {
        try {
          if ((doc.user as any).fcm_token) {
            await this.notificationDispatcher.dispatchDocumentExpiredNotification(
              doc.user,
              doc,
            );

            this.logger.debug(
              `Sent expired notification for ${doc.document_type} document to user ${doc.user.id}`,
            );
          }
        } catch (err) {
          this.logger.error(
            `Failed to send expired notification for document ${doc.id}:`,
            err,
          );
        }
      }

      this.logger.log('Expired document check completed');
    } catch (err) {
      this.logger.error('Error during expired document check:', err);
    }
  }

  /**
   * Manual trigger for document expiry check (for testing or manual invocation)
   */
  async manualCheckExpiringDocuments() {
    this.logger.log('Manual trigger: checking expiring documents...');
    await this.checkExpiringDocuments();
  }

  /**
   * Calculate days until expiry
   */
  private calculateDaysUntilExpiry(expiryDate: Date): number {
    const now = new Date();
    const diffTime = expiryDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }
}
