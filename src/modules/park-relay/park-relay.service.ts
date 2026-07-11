import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GeolocationService } from 'src/common/services/geolocation.service';
import { NotificationEventService } from '../notification/services/notification-event.service';
import { NotificationEventTypeEnum } from '../notification/dtos/notification-event.dto';
import { FireBaseClient } from '../notification/providers/firebase.provider';
import { ParkingCost } from 'src/common/enums';
import {
  CreateParkingAreaDto,
  CreateParkingHandoffDto,
  CreateParkingSessionDto,
  ParkingSaveSourceDto,
  SaveParkingLocationDto,
  UpdateParkingAreaDto,
  UpdateParkingModeDto,
} from './dtos/park-relay.dto';

@Injectable()
export class ParkRelayService {
  private readonly logger = new Logger(ParkRelayService.name);
  private readonly HANDOFF_WINDOW_MINUTES = 5;
  private readonly HANDOFF_RADIUS_METERS = 300;
  private readonly PARKING_EXPIRY_WARNING_MINUTES = 10;

  constructor(
    private readonly prismaService: PrismaService,
    private readonly geolocationService: GeolocationService,
    private readonly notificationEventService: NotificationEventService,
    private readonly firebaseClient: FireBaseClient,
  ) {}

  async startSearching(userId: string, dto: UpdateParkingModeDto) {
    this.validateCoordinates(dto.latitude, dto.longitude);

    return this.prismaService.parkingSearchSession.upsert({
      where: { userId },
      create: {
        userId,
        latitude: dto.latitude,
        longitude: dto.longitude,
        accuracy: dto.accuracy,
        status: 'SEARCHING',
      },
      update: {
        latitude: dto.latitude,
        longitude: dto.longitude,
        accuracy: dto.accuracy,
        status: 'SEARCHING',
      },
    });
  }

  async markParked(userId: string, dto: UpdateParkingModeDto) {
    this.validateCoordinates(dto.latitude, dto.longitude);

    return this.prismaService.parkingSearchSession.upsert({
      where: { userId },
      create: {
        userId,
        latitude: dto.latitude,
        longitude: dto.longitude,
        accuracy: dto.accuracy,
        status: 'PARKED',
      },
      update: {
        latitude: dto.latitude,
        longitude: dto.longitude,
        accuracy: dto.accuracy,
        status: 'PARKED',
      },
    });
  }

  async setIdle(userId: string) {
    const session = await this.prismaService.parkingSearchSession.findUnique({
      where: { userId },
    });

    if (!session) {
      return { status: 'IDLE' };
    }

    return this.prismaService.parkingSearchSession.update({
      where: { userId },
      data: { status: 'IDLE' },
    });
  }

  async getMyParkingMode(userId: string) {
    const session = await this.prismaService.parkingSearchSession.findUnique({
      where: { userId },
    });

    return session ?? { userId, status: 'IDLE' };
  }

  async createHandoff(userId: string, dto: CreateParkingHandoffDto) {
    this.validateCoordinates(dto.latitude, dto.longitude);
    await this.expireOldHandoffs();

    const expiresAt = new Date(Date.now() + this.HANDOFF_WINDOW_MINUTES * 60 * 1000);
    const handoff = await this.prismaService.parkingHandoff.create({
      data: {
        releaserId: userId,
        spotId: dto.spotId,
        latitude: dto.latitude,
        longitude: dto.longitude,
        expiresAt,
        status: 'AVAILABLE',
      },
    });

    await this.markParked(userId, {
      latitude: dto.latitude,
      longitude: dto.longitude,
    });

    const seekers = await this.findActiveSeekers(dto.latitude, dto.longitude, userId);
    await Promise.all(
      seekers.map((seeker) =>
        this.notifyParkingHandoffSeeker(seeker.id, handoff, seeker.distance),
      ),
    );

    return {
      ...handoff,
      windowSeconds: this.HANDOFF_WINDOW_MINUTES * 60,
      radiusMeters: this.HANDOFF_RADIUS_METERS,
      notifiedSeekers: seekers.length,
      googleMapsLink: this.buildGoogleMapsLink(dto.latitude, dto.longitude, 'driving'),
    };
  }

  async acceptHandoff(userId: string, handoffId: string) {
    await this.expireOldHandoffs();

    const handoff = await this.prismaService.parkingHandoff.findUnique({
      where: { id: handoffId },
    });

    if (!handoff) {
      throw new NotFoundException('Parking handoff not found');
    }

    if (handoff.releaserId === userId) {
      throw new BadRequestException('You cannot accept your own parking handoff');
    }

    if (handoff.expiresAt < new Date()) {
      await this.prismaService.parkingHandoff.update({
        where: { id: handoffId },
        data: { status: 'EXPIRED' },
      });
      throw new BadRequestException('Parking handoff has expired');
    }

    const result = await this.prismaService.parkingHandoff.updateMany({
      where: {
        id: handoffId,
        status: 'AVAILABLE',
        seekerId: null,
        expiresAt: { gte: new Date() },
      },
      data: {
        seekerId: userId,
        status: 'ACCEPTED',
        acceptedAt: new Date(),
      },
    });

    if (result.count === 0) {
      throw new BadRequestException('Parking handoff is no longer available');
    }

    await this.markParked(userId, {
      latitude: handoff.latitude,
      longitude: handoff.longitude,
    });

    const accepted = await this.prismaService.parkingHandoff.findUnique({
      where: { id: handoffId },
    });

    return {
      ...accepted,
      googleMapsLink: this.buildGoogleMapsLink(handoff.latitude, handoff.longitude, 'driving'),
    };
  }

  async cancelHandoff(userId: string, handoffId: string) {
    const handoff = await this.prismaService.parkingHandoff.findUnique({
      where: { id: handoffId },
    });

    if (!handoff) {
      throw new NotFoundException('Parking handoff not found');
    }

    if (handoff.releaserId !== userId) {
      throw new BadRequestException('Only the releaser can cancel this handoff');
    }

    if (handoff.status !== 'AVAILABLE') {
      throw new BadRequestException('Only available handoffs can be cancelled');
    }

    return this.prismaService.parkingHandoff.update({
      where: { id: handoffId },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
      },
    });
  }

  async markHandoffOccupied(userId: string, handoffId: string) {
    const handoff = await this.prismaService.parkingHandoff.findUnique({
      where: { id: handoffId },
    });

    if (!handoff) {
      throw new NotFoundException('Parking handoff not found');
    }

    if (handoff.releaserId !== userId && handoff.seekerId !== userId) {
      throw new BadRequestException('You are not part of this parking handoff');
    }

    return this.prismaService.parkingHandoff.update({
      where: { id: handoffId },
      data: {
        status: 'OCCUPIED',
        occupiedAt: new Date(),
      },
    });
  }

  async getNearbyHandoffs(latitude: number, longitude: number, radiusMeters = this.HANDOFF_RADIUS_METERS) {
    this.validateCoordinates(latitude, longitude);
    await this.expireOldHandoffs();

    const handoffs = await this.prismaService.parkingHandoff.findMany({
      where: {
        status: 'AVAILABLE',
        expiresAt: { gte: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    return handoffs
      .map((handoff) => ({
        ...handoff,
        distanceMeters: Math.round(
          this.geolocationService.calculateDistance(
            latitude,
            longitude,
            handoff.latitude,
            handoff.longitude,
          ),
        ),
        googleMapsLink: this.buildGoogleMapsLink(handoff.latitude, handoff.longitude, 'driving'),
      }))
      .filter((handoff) => handoff.distanceMeters <= radiusMeters)
      .sort((a, b) => a.distanceMeters - b.distanceMeters);
  }

  async saveParkingLocation(userId: string, dto: SaveParkingLocationDto) {
    this.validateCoordinates(dto.latitude, dto.longitude);

    const saved = await this.prismaService.savedParkingLocation.upsert({
      where: { userId },
      create: {
        userId,
        latitude: dto.latitude,
        longitude: dto.longitude,
        accuracy: dto.accuracy,
        confidence: dto.confidence,
        source: dto.source ?? ParkingSaveSourceDto.MANUAL,
      },
      update: {
        latitude: dto.latitude,
        longitude: dto.longitude,
        accuracy: dto.accuracy,
        confidence: dto.confidence,
        source: dto.source ?? ParkingSaveSourceDto.MANUAL,
      },
    });

    return {
      ...saved,
      googleMapsWalkingLink: this.buildGoogleMapsLink(saved.latitude, saved.longitude, 'walking'),
    };
  }

  async getSavedParkingLocation(userId: string) {
    const saved = await this.prismaService.savedParkingLocation.findUnique({
      where: { userId },
    });

    if (!saved) {
      throw new NotFoundException('Saved parking location not found');
    }

    return {
      ...saved,
      googleMapsWalkingLink: this.buildGoogleMapsLink(saved.latitude, saved.longitude, 'walking'),
    };
  }

  async deleteSavedParkingLocation(userId: string) {
    const saved = await this.prismaService.savedParkingLocation.findUnique({
      where: { userId },
    });

    if (!saved) {
      throw new NotFoundException('Saved parking location not found');
    }

    await this.prismaService.savedParkingLocation.delete({
      where: { userId },
    });

    return { message: 'Saved parking location deleted successfully' };
  }

  async createParkingSession(userId: string, dto: CreateParkingSessionDto) {
    this.validateCoordinates(dto.latitude, dto.longitude);

    if (dto.costType === ParkingCost.PAID && (!dto.durationMin || dto.durationMin <= 0)) {
      throw new BadRequestException('durationMin is required for paid parking sessions');
    }

    await this.prismaService.parkingSession.updateMany({
      where: { userId, status: 'ACTIVE' },
      data: { status: 'LEFT' },
    });

    const expiresAt =
      dto.costType === ParkingCost.PAID
        ? new Date(Date.now() + dto.durationMin! * 60 * 1000)
        : null;

    const session = await this.prismaService.parkingSession.create({
      data: {
        userId,
        spotId: dto.spotId,
        latitude: dto.latitude,
        longitude: dto.longitude,
        costType: dto.costType as any,
        durationMin: dto.durationMin,
        expiresAt,
        status: 'ACTIVE',
      },
    });

    await this.markParked(userId, {
      latitude: dto.latitude,
      longitude: dto.longitude,
    });

    return {
      ...session,
      googleMapsWalkingLink: this.buildGoogleMapsLink(dto.latitude, dto.longitude, 'walking'),
    };
  }

  async getActiveParkingSession(userId: string) {
    await this.expireParkingSessions();

    const session = await this.prismaService.parkingSession.findFirst({
      where: { userId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    });

    if (!session) {
      throw new NotFoundException('Active parking session not found');
    }

    return {
      ...session,
      googleMapsWalkingLink: this.buildGoogleMapsLink(session.latitude, session.longitude, 'walking'),
    };
  }

  async leaveParkingSession(userId: string, sessionId: string) {
    const session = await this.prismaService.parkingSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException('Parking session not found');
    }

    if (session.userId !== userId) {
      throw new BadRequestException('You can only leave your own parking session');
    }

    await this.setIdle(userId);

    return this.prismaService.parkingSession.update({
      where: { id: sessionId },
      data: { status: 'LEFT' },
    });
  }

  async dispatchParkingExpiryWarnings() {
    const warningCutoff = new Date(
      Date.now() + this.PARKING_EXPIRY_WARNING_MINUTES * 60 * 1000,
    );

    const sessions = await this.prismaService.parkingSession.findMany({
      where: {
        status: 'ACTIVE',
        costType: ParkingCost.PAID as any,
        expiresAt: {
          lte: warningCutoff,
          gt: new Date(),
        },
        expiryWarningSentAt: null,
      },
    });

    for (const session of sessions) {
      await this.notifyParkingExpiry(session.userId, session);
      await this.prismaService.parkingSession.update({
        where: { id: session.id },
        data: { expiryWarningSentAt: new Date() },
      });
    }

    await this.expireParkingSessions();

    return { warningsSent: sessions.length };
  }

  async createParkingArea(adminId: string, dto: CreateParkingAreaDto) {
    this.validatePolygon(dto.polygon);

    return this.prismaService.parkingArea.create({
      data: {
        name: dto.name,
        description: dto.description,
        centerLat: dto.centerLat,
        centerLng: dto.centerLng,
        polygon: dto.polygon as any,
        parkingCost: dto.parkingCost as any,
        isActive: dto.isActive ?? true,
        createdById: adminId,
      },
    });
  }

  async getParkingAreas(page = 1, limit = 20) {
    const skip = (Number(page) - 1) * Number(limit);
    const [areas, total] = await Promise.all([
      this.prismaService.parkingArea.findMany({
        skip,
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
      }),
      this.prismaService.parkingArea.count(),
    ]);

    return { areas, total, page: Number(page), limit: Number(limit) };
  }

  async getNearbyParkingAreas(latitude: number, longitude: number, radiusMeters = 1000) {
    this.validateCoordinates(latitude, longitude);

    const areas = await this.prismaService.parkingArea.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    });

    return areas
      .map((area) => ({
        ...area,
        distanceMeters: Math.round(
          this.geolocationService.calculateDistance(
            latitude,
            longitude,
            area.centerLat,
            area.centerLng,
          ),
        ),
        googleMapsLink: this.buildGoogleMapsLink(area.centerLat, area.centerLng, 'driving'),
      }))
      .filter((area) => area.distanceMeters <= Number(radiusMeters))
      .sort((a, b) => a.distanceMeters - b.distanceMeters);
  }

  async updateParkingArea(areaId: string, dto: UpdateParkingAreaDto) {
    const area = await this.prismaService.parkingArea.findUnique({
      where: { id: areaId },
    });

    if (!area) {
      throw new NotFoundException('Parking area not found');
    }

    if (dto.polygon) {
      this.validatePolygon(dto.polygon);
    }

    return this.prismaService.parkingArea.update({
      where: { id: areaId },
      data: {
        name: dto.name,
        description: dto.description,
        centerLat: dto.centerLat,
        centerLng: dto.centerLng,
        polygon: dto.polygon as any,
        parkingCost: dto.parkingCost as any,
        isActive: dto.isActive,
      },
    });
  }

  async deleteParkingArea(areaId: string) {
    const area = await this.prismaService.parkingArea.findUnique({
      where: { id: areaId },
    });

    if (!area) {
      throw new NotFoundException('Parking area not found');
    }

    await this.prismaService.parkingArea.delete({
      where: { id: areaId },
    });

    return { message: 'Parking area deleted successfully' };
  }

  private async findActiveSeekers(latitude: number, longitude: number, excludeUserId: string) {
    const sessions = await this.prismaService.parkingSearchSession.findMany({
      where: { status: 'SEARCHING' },
    });

    const candidates = await Promise.all(
      sessions
        .filter((session) => session.userId !== excludeUserId)
        .map(async (session) => {
          const distance = this.geolocationService.calculateDistance(
            latitude,
            longitude,
            session.latitude,
            session.longitude,
          );

          if (distance > this.HANDOFF_RADIUS_METERS) {
            return null;
          }

          const user = await this.prismaService.user.findUnique({
            where: { id: session.userId },
            select: {
              id: true,
              fcm_token: true,
              is_blocked: true,
              is_deleted: true,
            },
          });

          if (!user || user.is_blocked || user.is_deleted) {
            return null;
          }

          return {
            id: user.id,
            fcmToken: user.fcm_token,
            distance: Math.round(distance),
          };
        }),
    );

    return candidates
      .filter((candidate): candidate is { id: string; fcmToken: string | null; distance: number } => Boolean(candidate))
      .sort((a, b) => a.distance - b.distance);
  }

  private async notifyParkingHandoffSeeker(
    seekerId: string,
    handoff: { id: string; latitude: number; longitude: number; expiresAt: Date },
    distanceMeters: number,
  ) {
    const title = 'Parking spot opening nearby';
    const message = 'A driver is leaving a parking spot near you';
    const payload = {
      handoffId: handoff.id,
      latitude: handoff.latitude,
      longitude: handoff.longitude,
      expiresAt: handoff.expiresAt,
      distanceMeters,
      googleMapsLink: this.buildGoogleMapsLink(handoff.latitude, handoff.longitude, 'driving'),
      type: 'PARK_RELAY_HANDOFF',
    };

    try {
      await this.notificationEventService.createEvent({
        userId: seekerId,
        eventType: NotificationEventTypeEnum.PARKING_NEARBY,
        title,
        message,
        payload,
      });

      const user = await this.prismaService.user.findUnique({
        where: { id: seekerId },
        select: { fcm_token: true },
      });

      if (user?.fcm_token) {
        await this.firebaseClient.sendPushNotification(user.fcm_token, title, message);
      }
    } catch (err: any) {
      this.logger.error(`Failed to notify seeker ${seekerId}: ${err.message}`);
    }
  }

  private async notifyParkingExpiry(userId: string, session: any) {
    const title = 'Paid parking expiring soon';
    const message = 'Are you leaving the paid spot? Your paid spot is expiring in 10 minutes.';

    try {
      await this.notificationEventService.createEvent({
        userId,
        eventType: NotificationEventTypeEnum.PARKING_EXPIRING_SOON,
        title,
        message,
        payload: {
          parkingSessionId: session.id,
          expiresAt: session.expiresAt,
          latitude: session.latitude,
          longitude: session.longitude,
          type: 'PARKTIME_EXPIRY_WARNING',
        },
      });

      const user = await this.prismaService.user.findUnique({
        where: { id: userId },
        select: { fcm_token: true },
      });

      if (user?.fcm_token) {
        await this.firebaseClient.sendPushNotification(user.fcm_token, title, message);
      }
    } catch (err: any) {
      this.logger.error(`Failed to send parking expiry warning to ${userId}: ${err.message}`);
    }
  }

  private async expireOldHandoffs() {
    await this.prismaService.parkingHandoff.updateMany({
      where: {
        status: 'AVAILABLE',
        expiresAt: { lt: new Date() },
      },
      data: { status: 'EXPIRED' },
    });
  }

  private async expireParkingSessions() {
    await this.prismaService.parkingSession.updateMany({
      where: {
        status: 'ACTIVE',
        expiresAt: { lt: new Date() },
      },
      data: { status: 'EXPIRED' },
    });
  }

  private validateCoordinates(latitude: number, longitude: number) {
    if (!this.geolocationService.validateCoordinates(Number(latitude), Number(longitude))) {
      throw new BadRequestException('Invalid latitude or longitude');
    }
  }

  private validatePolygon(polygon: Array<{ latitude: number; longitude: number }>) {
    if (polygon.length < 3) {
      throw new BadRequestException('Parking area polygon must contain at least three points');
    }

    polygon.forEach((point) => this.validateCoordinates(point.latitude, point.longitude));
  }

  private buildGoogleMapsLink(latitude: number, longitude: number, travelMode: 'driving' | 'walking') {
    return `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}&travelmode=${travelMode}`;
  }
}
