/**
 * Parking Notification Credit System DTO
 * 
 * Credit System Rules:
 * - Every user gets 1 FREE parking notification when they first register
 * - Each parking report submission grants 1 notification credit
 * - Each parking notification received consumes 1 credit
 * - User can receive up to (number of parking reports submitted) notifications from other users
 */

export class ParkingCreditResponseDto {
  /**
   * Total number of parking notifications currently available
   * Starts at 1 (free notification) and increases by 1 for each parking report submitted
   */
  parking_notifications_available: number;

  /**
   * Total number of parking reports submitted by the user
   * Each report gives 1 notification credit
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
