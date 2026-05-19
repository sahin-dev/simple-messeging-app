import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateParkingReportDto, UpdateParkingReportDto } from './dtos';
import { DisabledFacilityLocation } from 'generated/prisma/enums';
import { NotificationDispatcherService } from '../notification/services/notification-dispatcher.service';

@Injectable()
export class ParkingReportService {
  private readonly EXPIRATION_TIME_MINUTES = 10;
  private readonly logger = new Logger(ParkingReportService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly notificationDispatcherService: NotificationDispatcherService,
  ) {}

  /**
   * Calculate expiration time (current time + 10 minutes)
   */
  private getExpirationTime(): Date {
    const now = new Date();
    return new Date(now.getTime() + this.EXPIRATION_TIME_MINUTES * 60 * 1000);
  }

  /**
   * Check if a report is expired
   */
  private isReportExpired(createdAt: Date): boolean {
    const now = new Date();
    const tenMinutesAgo = new Date(now.getTime() - this.EXPIRATION_TIME_MINUTES * 60 * 1000);
    return createdAt < tenMinutesAgo;
  }

  /**
   * Get the time remaining for a report (in milliseconds)
   */
  getTimeRemaining(createdAt: Date): number {
    const now = new Date();
    const expiresAt = new Date(createdAt.getTime() + this.EXPIRATION_TIME_MINUTES * 60 * 1000);
    const remaining = expiresAt.getTime() - now.getTime();
    return remaining > 0 ? remaining : 0;
  }

  async createParkingReport(userId: string, createParkingReportDto: CreateParkingReportDto) {
    const expiresAt = this.getExpirationTime();

    const report = await this.prismaService.parkingReport.create({
      data: {
        user_id: userId,
        latitude: createParkingReportDto.latitude,
        longitude: createParkingReportDto.longitude,
        parking_cost: createParkingReportDto.parking_cost,
        electric_charging: createParkingReportDto.electric_charging,
        disabled_facility: createParkingReportDto.disabled_facility,
        disabled_facility_location: DisabledFacilityLocation[createParkingReportDto.disabled_facility_location],
        expiresAt,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            nick_name: true,
            avatar: true,
          },
        },
      },
    });

    // Increment parking report credit for the user
    try {
      const updatedUser = await this.prismaService.user.update({
        where: { id: userId },
        data: {
          parking_reports_submitted: { increment: 1 },
          parking_notifications_available: { increment: 1 },
        },
      });

      // Track credit transaction
      await this.prismaService.parkingNotificationCredit.create({
        data: {
          user_id: userId,
          parking_report_id: report.id,
          transaction_type: 'EARNED',
          amount: 1,
          balance: updatedUser.parking_notifications_available,
        },
      });

      this.logger.log(
        `Parking report credit earned for user ${userId}. New balance: ${updatedUser.parking_notifications_available}`,
      );
    } catch (err: any) {
      this.logger.error(
        `Failed to update parking notification credit for user ${userId}: ${err.message}`,
      );
    }

    const formattedReport = this.formatReportResponse(report);

    // Trigger parking availability notification to nearby users
    try {
      this.notificationDispatcherService.dispatchParkingNotification(report).catch((err) => {
        this.logger.error(`Failed to dispatch parking notification: ${err.message}`);
      });
    } catch (err:any) {
      this.logger.error(`Error triggering parking notification: ${err.message}`);
    }

    return formattedReport;
  }

  /**
   * Format report response with remaining time and expiration status
   */
  private formatReportResponse(report: any) {
    const timeRemaining = this.getTimeRemaining(report.createdAt);
    const isExpired = timeRemaining === 0;

    return {
      ...report,
      isExpired,
      timeRemainingSeconds: Math.ceil(timeRemaining / 1000),
      expiresAt: report.expiresAt || new Date(report.createdAt.getTime() + this.EXPIRATION_TIME_MINUTES * 60 * 1000),
    };
  }

  /**
   * Filter out expired reports from an array
   */
  private filterActiveReports(reports: any[]): any[] {
    return reports
      .filter(report => !this.isReportExpired(report.createdAt))
      .map(report => this.formatReportResponse(report));
  }

  async getParkingReportById(id: string) {
    const report = await this.prismaService.parkingReport.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            nick_name: true,
            avatar: true,
            email: true,
          },
        },
      },
    });

    if (!report) {
      throw new NotFoundException(`Parking report with ID ${id} not found`);
    }

    if (this.isReportExpired(report.createdAt)) {
      throw new NotFoundException(`Parking report with ID ${id} has expired`);
    }

    return this.formatReportResponse(report);
  }

  async getAllParkingReports(page: number = 1, limit: number = 10, isActive: boolean = true) {
    const skip = (page - 1) * limit;
    const now = new Date();
    const tenMinutesAgo = new Date(now.getTime() - this.EXPIRATION_TIME_MINUTES * 60 * 1000);

    const [reports, total] = await Promise.all([
      this.prismaService.parkingReport.findMany({
        where: {
          is_active: isActive,
          // createdAt: {
          //   gte: tenMinutesAgo, // Only get reports created in the last 10 minutes
          // },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              nick_name: true,
              avatar: true,
            },
          },
        },
      }),
      this.prismaService.parkingReport.count({
        where: {
          is_active: isActive,
          createdAt: {
            gte: tenMinutesAgo,
          },
        },
      }),
    ]);

    const formattedReports = this.filterActiveReports(reports);

    return { reports: formattedReports, total: formattedReports.length, page, limit };
  }

  async getParkingReportsByUserId(userId: string, page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;
    const now = new Date();
    const tenMinutesAgo = new Date(now.getTime() - this.EXPIRATION_TIME_MINUTES * 60 * 1000);

    const [reports, total] = await Promise.all([
      this.prismaService.parkingReport.findMany({
        where: {
          user_id: userId,
          createdAt: {
            gte: tenMinutesAgo,
          },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              nick_name: true,
              avatar: true,
            },
          },
        },
      }),
      this.prismaService.parkingReport.count({
        where: {
          user_id: userId,
          createdAt: {
            gte: tenMinutesAgo,
          },
        },
      }),
    ]);

    const formattedReports = this.filterActiveReports(reports);

    return { reports: formattedReports, total: formattedReports.length, page, limit };
  }

  async getNearbyParkingReports(
    latitude: number,
    longitude: number,
    radiusInKm: number = 5,
    page: number = 1,
    limit: number = 10,
  ) {
    // Approximate formula for nearby locations (roughly 111km per degree)
    const latDelta = radiusInKm / 111;
    const lonDelta = radiusInKm / (111 * Math.cos((latitude * Math.PI) / 180));

    const skip = (page - 1) * limit;
    const now = new Date();
    const tenMinutesAgo = new Date(now.getTime() - this.EXPIRATION_TIME_MINUTES * 60 * 1000);

    const [reports, total] = await Promise.all([
      this.prismaService.parkingReport.findMany({
        where: {
          is_active: true,
          createdAt: {
            gte: tenMinutesAgo,
          },
          latitude: {
            gte: latitude - latDelta,
            lte: latitude + latDelta,
          },
          longitude: {
            gte: longitude - lonDelta,
            lte: longitude + lonDelta,
          },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              nick_name: true,
              avatar: true,
            },
          },
        },
      }),
      this.prismaService.parkingReport.count({
        where: {
          is_active: true,
          createdAt: {
            gte: tenMinutesAgo,
          },
          latitude: {
            gte: latitude - latDelta,
            lte: latitude + latDelta,
          },
          longitude: {
            gte: longitude - lonDelta,
            lte: longitude + lonDelta,
          },
        },
      }),
    ]);

    const formattedReports = this.filterActiveReports(reports);

    return { reports: formattedReports, total: formattedReports.length, page, limit };
  }

  async updateParkingReport(id: string, userId: string, updateParkingReportDto: UpdateParkingReportDto) {
    const report = await this.prismaService.parkingReport.findUnique({
      where: { id },
    });

    if (!report) {
      throw new NotFoundException(`Parking report with ID ${id} not found`);
    }

    if (this.isReportExpired(report.createdAt)) {
      throw new NotFoundException(`Parking report with ID ${id} has expired`);
    }

    if (report.user_id !== userId) {
      throw new Error('Unauthorized: You can only update your own parking reports');
    }

    const updatedReport = await this.prismaService.parkingReport.update({
      where: { id },
      data: {
        latitude: updateParkingReportDto.latitude,
        longitude: updateParkingReportDto.longitude,
        parking_cost: updateParkingReportDto.parking_cost,
        electric_charging: updateParkingReportDto.electric_charging,
        disabled_facility: updateParkingReportDto.disabled_facility,
        disabled_facility_location: updateParkingReportDto.disabled_facility_location as DisabledFacilityLocation,
        is_active: updateParkingReportDto.is_active,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            nick_name: true,
            avatar: true,
          },
        },
      },
    });

    return this.formatReportResponse(updatedReport);
  }

  async deleteParkingReport(id: string, userId: string) {
    const report = await this.prismaService.parkingReport.findUnique({
      where: { id },
    });

    if (!report) {
      throw new NotFoundException(`Parking report with ID ${id} not found`);
    }

    if (report.user_id !== userId) {
      throw new Error('Unauthorized: You can only delete your own parking reports');
    }

    return this.prismaService.parkingReport.delete({
      where: { id },
    });
  }

  async deactivateParkingReport(id: string, userId: string) {
    const report = await this.prismaService.parkingReport.findUnique({
      where: { id },
    });

    if (!report) {
      throw new NotFoundException(`Parking report with ID ${id} not found`);
    }

    if (this.isReportExpired(report.createdAt)) {
      throw new NotFoundException(`Parking report with ID ${id} has expired`);
    }

    if (report.user_id !== userId) {
      throw new Error('Unauthorized: You can only deactivate your own parking reports');
    }

    const deactivatedReport = await this.prismaService.parkingReport.update({
      where: { id },
      data: { is_active: false },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            nick_name: true,
            avatar: true,
          },
        },
      },
    });

    return this.formatReportResponse(deactivatedReport);
  }

  /**
   * Get user's parking notification credit information
   * Shows how many notifications they have available and their submission history
   */
  async getUserParkingCredits(userId: string) {
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
      select: {
        parking_notifications_available: true,
        parking_reports_submitted: true,
      },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    // Calculate notifications received = reports submitted - available + 1 (the free one)
    const notificationsReceived =
      user.parking_reports_submitted - user.parking_notifications_available + 1;

    return {
      parking_notifications_available: user.parking_notifications_available,
      parking_reports_submitted: user.parking_reports_submitted,
      notifications_received: Math.max(0, notificationsReceived), // Ensure it's not negative
    };
  }

  /**
   * Get user's parking notification credit transaction history
   * Shows all earned and consumed credits
   */
  async getUserParkingCreditHistory(
    userId: string,
    page: number = 1,
    limit: number = 10,
  ) {
    const skip = (page - 1) * limit;

    const [transactions, total] = await Promise.all([
      this.prismaService.parkingNotificationCredit.findMany({
        where: { user_id: userId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prismaService.parkingNotificationCredit.count({
        where: { user_id: userId },
      }),
    ]);

    return {
      transactions,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}


