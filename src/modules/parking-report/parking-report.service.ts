import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { CreateParkingSpotDto } from './dtos/create-parking-spot.dto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateParkingReportDto, UpdateParkingReportDto } from './dtos';
import { DisabledFacilityLocation } from 'generated/prisma/enums';
import { NotificationDispatcherService } from '../notification/services/notification-dispatcher.service';
import { GeolocationService } from '../../common/services/geolocation.service';

@Injectable()
export class ParkingReportService {
  private readonly EXPIRATION_TIME_MINUTES = 10;
  private readonly DEFAULT_NEARBY_RADIUS_METERS = 200;
  private readonly logger = new Logger(ParkingReportService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly notificationDispatcherService: NotificationDispatcherService,
    private readonly geolocationService: GeolocationService,
  ) { }

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
    const { spotId, latitude, longitude, parking_cost, electric_charging, disabled_facility, disabled_facility_location } = createParkingReportDto;

    const disabledFacilityLocationValue = disabled_facility_location
      ? DisabledFacilityLocation[disabled_facility_location]
      : undefined;

    // --- Spot-linked flow ---
    if (spotId) {
      const spot = await this.prismaService.parkingSpot.findUnique({ where: { id: spotId } });
      if (!spot) {
        throw new NotFoundException(`Parking spot with ID ${spotId} not found`);
      }

      // 1. Time constraint: user within 10 minute window can not submit report for same spot
      const tenMinutesAgo = new Date(Date.now() - this.EXPIRATION_TIME_MINUTES * 60 * 1000);
      const existingReport = await this.prismaService.parkingReport.findFirst({
        where: {
          user_id: userId,
          spotId,
          createdAt: { gte: tenMinutesAgo },
        },
      });
      if (existingReport) {
        throw new BadRequestException('You cannot submit a report for the same spot within 10 minutes');
      }

      // 2. Distance constraint: user distance above 10m from parking spot can not generate report
      const userLocation = await this.geolocationService.getUserLocation(userId);
      if (!userLocation) {
        throw new BadRequestException('User location not found. Please update your location first.');
      }
      const distance = this.geolocationService.calculateDistance(
        spot.latitude,
        spot.longitude,
        userLocation.latitude,
        userLocation.longitude,
      );
      if (distance > 10) {
        throw new BadRequestException('You must be within 10 meters of the parking spot to generate a report');
      }

      // Update the spot with the latest data from the report
      await this.prismaService.parkingSpot.update({
        where: { id: spotId },
        data: {
          parking_cost,
          electric_charging,
          disabled_facility,
          ...(disabledFacilityLocationValue !== undefined && { disabled_facility_location: disabledFacilityLocationValue }),
          // Only override coordinates if the user explicitly provided them
          ...(latitude !== undefined && { latitude }),
          ...(longitude !== undefined && { longitude }),
        },
      });

      // Use spot coordinates as the source of truth, falling back to DTO overrides
      const reportLat = latitude ?? spot.latitude;
      const reportLng = longitude ?? spot.longitude;

      const report = await this.prismaService.parkingReport.create({
        data: {
          user_id: userId,
          spotId,
          latitude: reportLat,
          longitude: reportLng,
          parking_cost,
          electric_charging,
          disabled_facility,
          disabled_facility_location: disabledFacilityLocationValue,
          expiresAt,
        },
        include: {
          user: { select: { id: true, name: true, nick_name: true, avatar: true } },
        },
      });

      this.logger.log(`Parking report created and spot ${spotId} updated by user ${userId}`);
      return this.postCreateCreditAndNotify(userId, report);
    }

    // --- Standalone flow (no spotId) ---
    if (latitude === undefined || longitude === undefined) {
      throw new BadRequestException('latitude and longitude are required when spotId is not provided');
    }

    const report = await this.prismaService.parkingReport.create({
      data: {
        user_id: userId,
        latitude,
        longitude,
        parking_cost,
        electric_charging,
        disabled_facility,
        disabled_facility_location: disabledFacilityLocationValue,
        expiresAt,
      },
      include: {
        user: { select: { id: true, name: true, nick_name: true, avatar: true } },
      },
    });

    return this.postCreateCreditAndNotify(userId, report);
  }

  /**
   * Shared post-create logic: dispatch availability notification to nearby users.
   * Credits are earned when a user notifies others they are leaving a spot.
   */
  private async postCreateCreditAndNotify(userId: string, report: any) {
    const formattedReport = this.formatReportResponse(report);

    try {
      this.notificationDispatcherService.dispatchParkingNotification(report).catch((err) => {
        this.logger.error(`Failed to dispatch parking notification: ${err.message}`);
      });
    } catch (err: any) {
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
          // createdAt: {
          //   gte: tenMinutesAgo,
          // },
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

  // ---------- Parking Spot Service Methods ----------
  async createParkingSpot(userId: string, createParkingSpotDto: CreateParkingSpotDto) {
    const spot = await this.prismaService.parkingSpot.create({
      data: {
        latitude: createParkingSpotDto.latitude,
        longitude: createParkingSpotDto.longitude,
        parking_cost: createParkingSpotDto.parking_cost,
        electric_charging: createParkingSpotDto.electric_charging,
        disabled_facility: createParkingSpotDto.disabled_facility,
        disabled_facility_location: createParkingSpotDto.disabled_facility_location
          ? DisabledFacilityLocation[createParkingSpotDto.disabled_facility_location]
          : undefined,
      },
    });
    return spot;
  }

  async getAllParkingSpots(page = 1, limit = 10) {
    const skip = (page - 1) * limit;
    const [spots, total] = await Promise.all([
      this.prismaService.parkingSpot.findMany({ skip, take: limit }),
      this.prismaService.parkingSpot.count(),
    ]);
    return { spots, total, page, limit };
  }

  async getParkingSpotById(id: string) {
    const spot = await this.prismaService.parkingSpot.findUnique({
      where: { id },
    });
    if (!spot) {
      throw new NotFoundException(`Parking spot with ID ${id} not found`);
    }
    return spot;
  }

  /**
   * Get parking spots within a radius of the user's location (default 200m).
   * Uses bounding-box pre-filter then Haversine for accurate distance.
   */
  async getNearbyParkingSpots(
    latitude: number,
    longitude: number,
    radiusInMeters: number = this.DEFAULT_NEARBY_RADIUS_METERS,
    page: number = 1,
    limit: number = 50,
  ) {
    if (!this.geolocationService.validateCoordinates(latitude, longitude)) {
      throw new BadRequestException('Invalid latitude or longitude');
    }

    const radiusInKm = radiusInMeters / 1000;
    const latDelta = radiusInKm / 111;
    const lonDelta = radiusInKm / (111 * Math.cos((latitude * Math.PI) / 180));
    const tenMinutesAgo = new Date(Date.now() - this.EXPIRATION_TIME_MINUTES * 60 * 1000);

    const candidates = await this.prismaService.parkingSpot.findMany({
      where: {
        is_active: true,
        latitude: { gte: latitude - latDelta, lte: latitude + latDelta },
        longitude: { gte: longitude - lonDelta, lte: longitude + lonDelta },
      },
      include: {
        reports: {
          where: {
            is_active: true,
            createdAt: { gte: tenMinutesAgo },
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            user: { select: { id: true, name: true, nick_name: true, avatar: true } },
          },
        },
      },
    });

    const spotsWithDistance = candidates
      .map((spot) => ({
        ...spot,
        distanceMeters: Math.round(
          this.geolocationService.calculateDistance(
            latitude,
            longitude,
            spot.latitude,
            spot.longitude,
          ),
        ),
        activeReport: spot.reports[0] ?? null,
      }))
      .filter((spot) => spot.distanceMeters <= radiusInMeters)
      .sort((a, b) => a.distanceMeters - b.distanceMeters);

    const skip = (page - 1) * limit;
    const paginatedSpots = spotsWithDistance.slice(skip, skip + limit);

    return {
      spots: paginatedSpots.map(({ reports, ...spot }) => spot),
      total: spotsWithDistance.length,
      page,
      limit,
      radiusInMeters,
    };
  }

  /**
   * User notifies nearby users they are leaving a parking spot.
   * Awards +1 credit to the leaving user and notifies users within 200m who have credits.
   */
  async leaveParkingSpot(userId: string, spotId: string) {
    const spot = await this.prismaService.parkingSpot.findUnique({
      where: { id: spotId },
    });

    if (!spot) {
      throw new NotFoundException(`Parking spot with ID ${spotId} not found`);
    }

    if (!spot.is_active) {
      throw new BadRequestException('This parking spot is no longer active');
    }

    // Check if user already reported leave for this spot within 10 minutes
    const tenMinutesAgo = new Date(Date.now() - this.EXPIRATION_TIME_MINUTES * 60 * 1000);
    const recentLeaveReport = await this.prismaService.parkingReport.findFirst({
      where: {
        user_id: userId,
        spotId,
        createdAt: { gte: tenMinutesAgo },
      },
    });

    if (recentLeaveReport) {
      return recentLeaveReport;
    }

    // Create a leave report for this user and spot
    const expiresAt = this.getExpirationTime();
    const leaveReport = await this.prismaService.parkingReport.create({
      data: {
        user_id: userId,
        spotId: spot.id,
        latitude: spot.latitude,
        longitude: spot.longitude,
        parking_cost: spot.parking_cost,
        electric_charging: spot.electric_charging,
        disabled_facility: spot.disabled_facility,
        disabled_facility_location: spot.disabled_facility_location,
        is_active: true,
        expiresAt,
      },
      include: {
        user: { select: { id: true, name: true, nick_name: true, avatar: true } },
      },
    });

    // Make spot available
    const updatedSpot = await this.prismaService.parkingSpot.update({
      where: { id: spotId },
      data: { available: true },
    });

    const leavingUser = await this.prismaService.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, nick_name: true },
    });

    const newBalance = await this.awardLeaveCredit(userId, leaveReport.id);

    this.notificationDispatcherService
      .dispatchParkingLeaveNotification(updatedSpot, leavingUser, leaveReport.id)
      .catch((err) => {
        this.logger.error(`Failed to dispatch parking leave notification: ${err.message}`);
      });

    return {
      spotId,
      latitude: updatedSpot.latitude,
      longitude: updatedSpot.longitude,
      available: updatedSpot.available,
      leaveReportId: leaveReport.id,
      creditAwarded: true,
      parking_notifications_available: newBalance,
    };
  }

  /**
   * Reserve a parking spot — marks it as unavailable for others.
   */
  async reserveParkingSpot(userId: string, spotId: string) {
    const spot = await this.prismaService.parkingSpot.findUnique({
      where: { id: spotId },
    });

    if (!spot) {
      throw new NotFoundException(`Parking spot with ID ${spotId} not found`);
    }

    if (!spot.is_active) {
      throw new BadRequestException('This parking spot is no longer active');
    }

    // if (!spot.available) {
    //   throw new BadRequestException('This parking spot is already reserved');
    // }

    const updatedSpot = await this.prismaService.parkingSpot.update({
      where: { id: spotId },
      data: { available: false },
    });

    this.logger.log(`Parking spot ${spotId} reserved by user ${userId}`);

    return {
      spotId: updatedSpot.id,
      latitude: updatedSpot.latitude,
      longitude: updatedSpot.longitude,
      available: updatedSpot.available,
    };
  }

  private async awardLeaveCredit(userId: string, referenceId: string): Promise<number> {
    const updatedUser = await this.prismaService.user.update({
      where: { id: userId },
      data: {
        parking_reports_submitted: { increment: 1 },
        parking_notifications_available: { increment: 1 },
      },
    });

    await this.prismaService.parkingNotificationCredit.create({
      data: {
        user_id: userId,
        parking_report_id: referenceId,
        transaction_type: 'EARNED',
        amount: 1,
        balance: updatedUser.parking_notifications_available,
      },
    });

    this.logger.log(
      `Leave notification credit earned for user ${userId}. New balance: ${updatedUser.parking_notifications_available}`,
    );

    return updatedUser.parking_notifications_available;
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


