import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { UserDocumentService } from './user-document.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationDispatcherService } from '../../notification/services/notification-dispatcher.service';

@Injectable()
export class DocumentExpiryCheckService {
  private readonly logger = new Logger(DocumentExpiryCheckService.name);

  // Ascending: the first (smallest/most urgent) threshold a document
  // hasn't been notified for yet is the one that fires.
  private readonly THRESHOLDS = [...UserDocumentService.EXPIRY_NOTIFICATION_THRESHOLDS].sort(
    (a, b) => a - b,
  );

  constructor(
    private readonly userDocumentService: UserDocumentService,
    private readonly prismaService: PrismaService,
    private readonly notificationDispatcher: NotificationDispatcherService,
  ) {}

  /**
   * Runs daily: checks for documents crossing a 15/7/1-day expiry threshold
   * and for documents that have newly expired, sending one notification per
   * threshold/document (see last_expiry_notified_days / expired_notified_at).
   */
  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async runDailyExpiryChecks() {
    await this.checkExpiringDocuments();
    await this.checkExpiredDocuments();
  }

  /**
   * Check for expiring documents and send threshold-based notifications.
   * Can be called manually or by the scheduler above.
   */
  async checkExpiringDocuments() {
    try {
      this.logger.log('Starting document expiry check...');

      const maxThreshold = this.THRESHOLDS[this.THRESHOLDS.length - 1];
      const expiringDocuments =
        await this.userDocumentService.getAllExpiringDocuments(maxThreshold);

      this.logger.log(`Found ${expiringDocuments.length} documents expiring within ${maxThreshold} days`);

      for (const doc of expiringDocuments) {
        try {
          if (!doc.expiry_date) {
            this.logger.warn(`Skipping document ${doc.id} because it has no expiry date`);
            continue;
          }

          const daysUntilExpiry = this.calculateDaysUntilExpiry(doc.expiry_date);
          const lastNotifiedDays = (doc as any).last_expiry_notified_days as number | null;

          // Find the most urgent threshold that applies and hasn't been sent yet
          const thresholdToNotify = this.THRESHOLDS.find(
            (threshold) =>
              daysUntilExpiry <= threshold &&
              (lastNotifiedDays === null || lastNotifiedDays === undefined || lastNotifiedDays > threshold),
          );

          if (thresholdToNotify === undefined) {
            continue; // already notified for the applicable tier
          }

          if (!(doc.user as any).fcm_token) {
            continue;
          }

          await this.notificationDispatcher.dispatchDocumentExpiryNotification(
            doc.user,
            doc,
            daysUntilExpiry,
          );

          await this.prismaService.userDocument.update({
            where: { id: doc.id },
            data: { last_expiry_notified_days: thresholdToNotify },
          });

          this.logger.debug(
            `Sent ${thresholdToNotify}-day expiry notification for ${doc.document_type} document to user ${doc.user.id} (actual days left: ${daysUntilExpiry})`,
          );
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
   * Check for newly expired documents and send a one-time expired alert.
   */
  async checkExpiredDocuments() {
    try {
      this.logger.log('Starting expired document check...');

      const expiredDocuments = await this.userDocumentService.getAllExpiredDocuments();

      this.logger.log(`Found ${expiredDocuments.length} expired documents pending notification`);

      for (const doc of expiredDocuments) {
        try {
          if (!(doc.user as any).fcm_token) {
            continue;
          }

          await this.notificationDispatcher.dispatchDocumentExpiredNotification(
            doc.user,
            doc,
          );

          await this.prismaService.userDocument.update({
            where: { id: doc.id },
            data: { expired_notified_at: new Date() },
          });

          this.logger.debug(
            `Sent expired notification for ${doc.document_type} document to user ${doc.user.id}`,
          );
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
  private calculateDaysUntilExpiry(expiryDate: Date | null): number {
    if (!expiryDate) {
      return -1;
    }

    const now = new Date();
    const diffTime = expiryDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }
}
