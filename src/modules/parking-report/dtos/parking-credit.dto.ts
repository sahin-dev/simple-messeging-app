/**
 * Parking Notification Credit System DTO
 *
 * Credit System Rules:
 * - Every user gets 1 FREE parking notification when they first register
 * - Each leave notification (notifying others you are leaving a spot) grants 1 credit
 * - Each parking notification received consumes 1 credit
 * - Users without credits will not receive leave/availability notifications
 */

export class ParkingCreditResponseDto {
  /**
   * Total number of parking notifications currently available
   * Starts at 1 (free notification) and increases by 1 for each leave notification sent
   */
  parking_notifications_available: number;

  /**
   * Total number of leave notifications sent by the user (each grants 1 credit)
   */
  parking_reports_submitted: number;

  /**
   * Number of parking notifications already consumed/received
   * Calculated as: parking_reports_submitted - parking_notifications_available + 1 (the free one)
   */
  notifications_received?: number;
}

export class ParkingNotificationCreditTransactionDto {
  id: string;
  user_id: string;
  parking_report_id: string;
  transaction_type: 'EARNED' | 'CONSUMED';
  amount: number;
  balance: number;
  createdAt: Date;
}
