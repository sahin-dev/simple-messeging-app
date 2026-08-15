import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GeolocationService } from 'src/common/services/geolocation.service';
import { NotificationEventService } from '../notification/services/notification-event.service';
import { NotificationEventTypeEnum } from '../notification/dtos/notification-event.dto';
import { FireBaseClient } from '../notification/providers/firebase.provider';
import { EMIT_EVENTS } from '../chat/enums/events.enum';
import { SocketRoomService } from '../chat/services/socket-room.service';
import { DisabledFacilityLocation, ParkingAreaType, ParkingCost } from 'src/common/enums';
import {
  AcceptHandoffAndParkDto,
  AnswerPaidParkingPromptDto,
  CreateParkingAreaDto,
  CreateParkingAreaRatingDto,
  CreateParkingHandoffDto,
  CreateParkingSessionDto,
  ParkingSaveSourceDto,
  ParkedEventDto,
  SaveParkingLocationDto,
  SearchParkingAreaDto,
  SubmitParkingAreaPointDto,
  UpdateParkingAreaDto,
  UpdateParkingAreaRatingDto,
  UpdateParkingModeDto,
} from './dtos/park-relay.dto';

@Injectable()
export class ParkRelayService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ParkRelayService.name);
  private readonly HANDOFF_WINDOW_MINUTES = 5;
  private readonly ACCEPTED_HANDOFF_WINDOW_MINUTES = 5;
  private readonly HANDOFF_RADIUS_METERS = 300;
  private readonly PARKING_EXPIRY_WARNING_MINUTES = 10;
  private readonly HANDOFF_CLEANUP_INTERVAL_MS = 60 * 1000;
  private readonly PARKING_EXPIRY_INTERVAL_MS = 60 * 1000;
  private handoffCleanupTimer?: NodeJS.Timeout;
  private parkingExpiryTimer?: NodeJS.Timeout;

  constructor(
    private readonly prismaService: PrismaService,
    private readonly geolocationService: GeolocationService,
    private readonly notificationEventService: NotificationEventService,
    private readonly firebaseClient: FireBaseClient,
    @Optional()
    private readonly socketRoomService?: SocketRoomService,
  ) {}

  onModuleInit() {
    this.handoffCleanupTimer = setInterval(() => {
      this.cleanupExpiredHandoffs().catch((error) => {
        this.logger.error(
          `Failed to clean up expired parking handoffs: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
    }, this.HANDOFF_CLEANUP_INTERVAL_MS);

    this.cleanupExpiredHandoffs().catch((error) => {
      this.logger.error(
        `Failed to run initial expired parking handoff cleanup: ${error instanceof Error ? error.message : String(error)}`,
      );
    });

    this.parkingExpiryTimer = setInterval(() => {
      this.dispatchParkingExpiryWarnings().catch((error) => {
        this.logger.error(
          `Failed to dispatch parking expiry warnings: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
    }, this.PARKING_EXPIRY_INTERVAL_MS);

    this.dispatchParkingExpiryWarnings().catch((error) => {
      this.logger.error(
        `Failed to run initial parking expiry warning dispatch: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }

  onModuleDestroy() {
    if (this.handoffCleanupTimer) {
      clearInterval(this.handoffCleanupTimer);
    }
    if (this.parkingExpiryTimer) {
      clearInterval(this.parkingExpiryTimer);
    }
  }

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
    await this.cleanupExpiredHandoffs();
    await this.assertNoUnexpiredHandoff(userId);

    const resolvedSpotId = dto.spotId ?? await this.resolveActiveParkingSpotId(userId);

    const expiresAt = new Date(Date.now() + this.HANDOFF_WINDOW_MINUTES * 60 * 1000);
    const approximateLocation = this.buildApproximateLocation(dto.latitude, dto.longitude);
    const handoff = await this.prismaService.parkingHandoff.create({
      data: {
        releaserId: userId,
        spotId: resolvedSpotId,
        latitude: dto.latitude,
        longitude: dto.longitude,
        approxLatitude: approximateLocation.latitude,
        approxLongitude: approximateLocation.longitude,
        expiresAt,
        status: 'AVAILABLE',
      },
    });

    await this.setIdle(userId);
    await this.closeActiveParkingForUser(userId);

    const seekers = await this.findActiveSeekers(dto.latitude, dto.longitude, userId);
    await Promise.all(
      seekers.map((seeker) =>
        this.notifyParkingHandoffSeeker(seeker.id, handoff, seeker.distance),
      ),
    );

    const areasBySpotId = await this.getParkingAreaSummariesBySpotIds([resolvedSpotId]);

    return this.attachParkingAreaSummary(
      {
        ...handoff,
        windowSeconds: this.HANDOFF_WINDOW_MINUTES * 60,
        radiusMeters: this.HANDOFF_RADIUS_METERS,
        notifiedSeekers: seekers.length,
        approximateLocation,
      },
      areasBySpotId,
    );
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
        expiresAt: new Date(Date.now() + this.ACCEPTED_HANDOFF_WINDOW_MINUTES * 60 * 1000),
      },
    });

    if (result.count === 0) {
      throw new BadRequestException('Parking handoff is no longer available');
    }

    const accepted = await this.prismaService.parkingHandoff.findUnique({
      where: { id: handoffId },
    });

    return {
      ...accepted,
      secondsAddedAfterAcceptance: this.ACCEPTED_HANDOFF_WINDOW_MINUTES * 60,
      googleMapsLink: this.buildGoogleMapsLink(handoff.latitude, handoff.longitude, 'driving'),
    };
  }

  async acceptHandoffAndPark(userId: string, handoffId: string, dto: AcceptHandoffAndParkDto) {
    const handoff = await this.prismaService.parkingHandoff.findUnique({
      where: { id: handoffId },
    });

    if (!handoff) {
      throw new NotFoundException('Parking handoff not found');
    }

    const alreadyAcceptedByUser = handoff.status === 'ACCEPTED' && handoff.seekerId === userId;

    if (!alreadyAcceptedByUser) {
      await this.acceptHandoff(userId, handoffId);
    }

    const occupied = await this.markHandoffOccupied(userId, handoffId);

    const areasBySpotId = await this.getParkingAreaSummariesBySpotIds([occupied.spotId]);
    const parkingArea = occupied.spotId ? areasBySpotId.get(occupied.spotId) ?? null : null;
    const parkingType = parkingArea?.parkingCost === ParkingCost.FREE ? ParkingCost.FREE : undefined;

    const savedParking = await this.saveParkingLocation(userId, {
      latitude: occupied.latitude,
      longitude: occupied.longitude,
      accuracy: dto.accuracy,
      confidence: dto.confidence,
      source: ParkingSaveSourceDto.AUTO,
      spotId: occupied.spotId ?? undefined,
      parkingType,
      note: dto.note,
      photoUrl: dto.photoUrl,
    }, true);

    const parkingMode = await this.markParked(userId, {
      latitude: occupied.latitude,
      longitude: occupied.longitude,
      accuracy: dto.accuracy,
      confidence: dto.confidence,
    });

    return {
      handoff: this.attachParkingAreaSummary(occupied, areasBySpotId),
      savedParking: this.attachParkingAreaSummary(savedParking, areasBySpotId),
      parkingMode,
      paidParkingPrompt: savedParking.paidParkingPrompt,
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

    await this.updateParkRelayReputation(handoff.releaserId, 'cancelled');

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

    if (handoff.seekerId !== userId) {
      throw new BadRequestException('Only the accepted seeker can mark this parking handoff occupied');
    }

    if (handoff.status !== 'ACCEPTED') {
      throw new BadRequestException('Only accepted parking handoffs can be marked occupied');
    }

    const updated = await this.prismaService.parkingHandoff.update({
      where: { id: handoffId },
      data: {
        status: 'OCCUPIED',
        occupiedAt: new Date(),
      },
    });

    await this.updateParkRelayReputation(handoff.releaserId, 'occupied');

    return updated;
  }

  async markHandoffFound(userId: string, handoffId: string) {
    const handoff = await this.prismaService.parkingHandoff.findUnique({
      where: { id: handoffId },
    });

    if (!handoff) {
      throw new NotFoundException('Parking handoff not found');
    }

    if (handoff.seekerId !== userId) {
      throw new BadRequestException('Only the accepted seeker can mark this parking handoff found');
    }

    if (handoff.status !== 'ACCEPTED') {
      throw new BadRequestException('Only accepted parking handoffs can be marked found');
    }

    const updated = await this.prismaService.parkingHandoff.update({
      where: { id: handoffId },
      data: {
        status: 'FOUND',
        foundAt: new Date(),
      },
    });

    await this.updateParkRelayReputation(handoff.releaserId, 'found');

    return updated;
  }

  async getNearbyHandoffs(
    userId: string,
    latitude: number,
    longitude: number,
    radiusMeters = this.HANDOFF_RADIUS_METERS,
  ) {
    this.validateCoordinates(latitude, longitude);
    await this.expireOldHandoffs();

    const handoffs = await this.prismaService.parkingHandoff.findMany({
      where: {
        status: 'AVAILABLE',
        expiresAt: { gte: new Date() },
        releaserId: { not: userId },
      },
      orderBy: { createdAt: 'desc' },
    });

    const nearby = handoffs
      .map((handoff) => ({
        id: handoff.id,
        spotId: handoff.spotId,
        status: handoff.status,
        expiresAt: handoff.expiresAt,
        createdAt: handoff.createdAt,
        updatedAt: handoff.updatedAt,
        latitude: handoff.approxLatitude ?? this.buildApproximateLocation(handoff.latitude, handoff.longitude).latitude,
        longitude: handoff.approxLongitude ?? this.buildApproximateLocation(handoff.latitude, handoff.longitude).longitude,
        hasExactLocation: false,
        distanceMeters: Math.round(
          this.geolocationService.calculateDistance(
            latitude,
            longitude,
            handoff.latitude,
            handoff.longitude,
          ),
        ),
      }))
      .filter((handoff) => handoff.distanceMeters <= radiusMeters)
      .sort((a, b) => a.distanceMeters - b.distanceMeters);

    const areasBySpotId = await this.getParkingAreaSummariesBySpotIds(
      nearby.map((handoff) => handoff.spotId),
    );

    return nearby.map((handoff) => this.attachParkingAreaSummary(handoff, areasBySpotId));
  }

  async getHandoffById(
    handoffId: string,
    userId?: string,
    latitude?: number,
    longitude?: number,
  ) {
    await this.expireOldHandoffs();

    const handoff = await this.prismaService.parkingHandoff.findUnique({
      where: { id: handoffId },
    });

    if (!handoff) {
      throw new NotFoundException('Parking handoff not found');
    }

    const distanceCoordinates = await this.resolveDistanceCoordinates(userId, latitude, longitude);
    const distanceMeters = distanceCoordinates
      ? Math.round(
          this.geolocationService.calculateDistance(
            distanceCoordinates.latitude,
            distanceCoordinates.longitude,
            handoff.latitude,
            handoff.longitude,
          ),
        )
      : null;

    const canSeeExactLocation = this.canSeeExactHandoffLocation(handoff, userId);
    const approximateLocation = this.getHandoffApproximateLocation(handoff);
    const responseLatitude = canSeeExactLocation ? handoff.latitude : approximateLocation.latitude;
    const responseLongitude = canSeeExactLocation ? handoff.longitude : approximateLocation.longitude;

    const areasBySpotId = await this.getParkingAreaSummariesBySpotIds([handoff.spotId]);

    return this.attachParkingAreaSummary({
      id: handoff.id,
      releaserId: handoff.releaserId,
      seekerId: handoff.seekerId,
      spotId: handoff.spotId,
      status: handoff.status,
      expiresAt: handoff.expiresAt,
      acceptedAt: handoff.acceptedAt,
      cancelledAt: handoff.cancelledAt,
      foundAt: handoff.foundAt,
      occupiedAt: handoff.occupiedAt,
      createdAt: handoff.createdAt,
      updatedAt: handoff.updatedAt,
      latitude: responseLatitude,
      longitude: responseLongitude,
      hasExactLocation: canSeeExactLocation,
      distanceMeters,
      googleMapsLink: canSeeExactLocation
        ? this.buildGoogleMapsLink(handoff.latitude, handoff.longitude, 'driving')
        : null,
    }, areasBySpotId);
  }

  async saveParkingLocation(
    userId: string,
    dto: SaveParkingLocationDto,
    createPaidParkingPrompt = true,
  ) {
    this.validateCoordinates(dto.latitude, dto.longitude);

    const paidExpiresAt = this.resolvePaidParkingExpiry(
      dto.parkingType,
      dto.durationMin,
      dto.expiresAt,
    );

    await this.prismaService.savedParkingLocation.updateMany({
      where: { userId, isActive: true },
      data: { isActive: false },
    });

    const savedParkingData = {
      userId,
      spotId: dto.spotId,
      latitude: dto.latitude,
      longitude: dto.longitude,
      accuracy: dto.accuracy,
      confidence: dto.confidence,
      source: dto.source ?? ParkingSaveSourceDto.MANUAL,
      note: dto.note,
      photoUrl: dto.photoUrl,
      isActive: true,
      parkingType: dto.parkingType as any,
      paidExpiresAt,
    };

    const saved = await this.createSavedParkingLocationWithIndexFallback(
      userId,
      savedParkingData,
    );

    const parkingSession =
      dto.parkingType === ParkingCost.PAID
        ? await this.createParkingSession(userId, {
            latitude: dto.latitude,
            longitude: dto.longitude,
            costType: ParkingCost.PAID,
            durationMin: dto.durationMin,
            expiresAt: dto.expiresAt,
          })
        : null;

    const paidParkingPrompt = dto.parkingType || !createPaidParkingPrompt
      ? null
      : await this.createPendingPaidParkingPrompt(userId, saved.id);

    return {
      ...saved,
      googleMapsWalkingLink: this.buildGoogleMapsLink(saved.latitude, saved.longitude, 'walking'),
      parkingSession,
      paidParkingPrompt,
    };
  }

  async processParkedEvent(userId: string, dto: ParkedEventDto) {
    const savedParking = await this.saveParkingLocation(userId, {
      ...dto,
      source: dto.source ?? ParkingSaveSourceDto.AUTO,
    }, dto.createPaidParkingPrompt !== false);

    const parkingMode = await this.markParked(userId, {
      latitude: dto.latitude,
      longitude: dto.longitude,
      accuracy: dto.accuracy,
      confidence: dto.confidence,
    });

    return {
      savedParking,
      parkingMode,
      paidParkingPrompt: savedParking.paidParkingPrompt,
    };
  }

  async getSavedParkingLocation(userId: string) {
    await this.expireParkingSessions();

    const saved = await this.prismaService.savedParkingLocation.findFirst({
      where: { userId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });

    if (!saved) {
      throw new NotFoundException('Saved parking location not found');
    }

    const [parkingSession, areasBySpotId] = await Promise.all([
      this.prismaService.parkingSession.findFirst({
        where: { userId, status: 'ACTIVE' },
        orderBy: { createdAt: 'desc' },
      }),
      this.getParkingAreaSummariesBySpotIds([saved.spotId]),
    ]);

    return this.attachParkingAreaSummary({
      ...saved,
      googleMapsWalkingLink: this.buildGoogleMapsLink(saved.latitude, saved.longitude, 'walking'),
      parkingSession: parkingSession
        ? {
            ...parkingSession,
            googleMapsWalkingLink: this.buildGoogleMapsLink(
              parkingSession.latitude,
              parkingSession.longitude,
              'walking',
            ),
          }
        : null,
    }, areasBySpotId);
  }

  async getSavedParkingHistory(userId: string, page = 1, limit = 20) {
    await this.expireParkingSessions();

    const normalizedPage = Math.max(Number(page) || 1, 1);
    const normalizedLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const skip = (normalizedPage - 1) * normalizedLimit;

    const [locations, total] = await Promise.all([
      this.prismaService.savedParkingLocation.findMany({
        where: { userId },
        skip,
        take: normalizedLimit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prismaService.savedParkingLocation.count({
        where: { userId },
      }),
    ]);

    const areasBySpotId = await this.getParkingAreaSummariesBySpotIds(
      locations.map((location) => location.spotId),
    );

    return {
      locations: locations.map((location) => this.attachParkingAreaSummary({
        ...location,
        googleMapsWalkingLink: this.buildGoogleMapsLink(
          location.latitude,
          location.longitude,
          'walking',
        ),
      }, areasBySpotId)),
      total,
      page: normalizedPage,
      limit: normalizedLimit,
      totalPages: Math.ceil(total / normalizedLimit),
    };
  }

  async getPendingPaidParkingPrompt(userId: string) {
    const prompt = await this.prismaService.paidParkingPrompt.findFirst({
      where: { userId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    });

    if (!prompt) {
      return null;
    }

    const savedParkingLocation = await this.prismaService.savedParkingLocation.findUnique({
      where: { id: prompt.savedParkingLocationId },
    });

    return {
      ...prompt,
      savedParkingLocation,
    };
  }

  async answerPaidParkingPrompt(
    userId: string,
    promptId: string,
    dto: AnswerPaidParkingPromptDto,
  ) {
    const prompt = await this.getOwnedPendingPaidParkingPrompt(userId, promptId);
    const savedParkingLocation = await this.prismaService.savedParkingLocation.findUnique({
      where: { id: prompt.savedParkingLocationId },
    });

    if (!savedParkingLocation) {
      throw new NotFoundException('Saved parking location not found');
    }

    const paidExpiresAt = this.resolvePaidParkingExpiry(
      dto.parkingType,
      dto.durationMin,
      dto.expiresAt,
    );

    const parkingSession = dto.parkingType === ParkingCost.PAID
      ? await this.createParkingSession(userId, {
          latitude: savedParkingLocation.latitude,
          longitude: savedParkingLocation.longitude,
          costType: ParkingCost.PAID,
          durationMin: dto.durationMin,
          expiresAt: dto.expiresAt,
        })
      : null;

    await this.prismaService.savedParkingLocation.update({
      where: { id: savedParkingLocation.id },
      data: {
        parkingType: dto.parkingType as any,
        paidExpiresAt,
      },
    });

    const updatedPrompt = await this.prismaService.paidParkingPrompt.update({
      where: { id: prompt.id },
      data: {
        status: 'ANSWERED',
        answeredAt: new Date(),
      },
    });

    return {
      prompt: updatedPrompt,
      parkingSession,
    };
  }

  async dismissPaidParkingPrompt(userId: string, promptId: string) {
    const prompt = await this.getOwnedPendingPaidParkingPrompt(userId, promptId);

    return this.prismaService.paidParkingPrompt.update({
      where: { id: prompt.id },
      data: {
        status: 'DISMISSED',
        answeredAt: new Date(),
      },
    });
  }

  async getAllSavedParkingLocations(page = 1, limit = 20) {
    await this.expireParkingSessions();

    const normalizedPage = Math.max(Number(page) || 1, 1);
    const normalizedLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const skip = (normalizedPage - 1) * normalizedLimit;

    const [locations, total] = await Promise.all([
      this.prismaService.savedParkingLocation.findMany({
        skip,
        take: normalizedLimit,
        orderBy: { updatedAt: 'desc' },
      }),
      this.prismaService.savedParkingLocation.count(),
    ]);

    const userIds = [...new Set(locations.map((location) => location.userId))];
    const users = await this.prismaService.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        name: true,
        nick_name: true,
        email: true,
        avatar: true,
        is_blocked: true,
        is_deleted: true,
      },
    });
    const usersById = new Map(users.map((user) => [user.id, user]));
    const parkingSessions = await this.prismaService.parkingSession.findMany({
      where: {
        userId: { in: userIds },
        status: 'ACTIVE',
      },
      orderBy: { createdAt: 'desc' },
    });
    const parkingSessionsByUserId = new Map<string, (typeof parkingSessions)[number]>();
    parkingSessions.forEach((session) => {
      if (!parkingSessionsByUserId.has(session.userId)) {
        parkingSessionsByUserId.set(session.userId, session);
      }
    });

    return {
      locations: locations.map((location) => {
        const parkingSession = parkingSessionsByUserId.get(location.userId);

        return {
          ...location,
          user: usersById.get(location.userId) ?? null,
          googleMapsWalkingLink: this.buildGoogleMapsLink(
            location.latitude,
            location.longitude,
            'walking',
          ),
          parkingSession: parkingSession
            ? {
                ...parkingSession,
                googleMapsWalkingLink: this.buildGoogleMapsLink(
                  parkingSession.latitude,
                  parkingSession.longitude,
                  'walking',
                ),
              }
            : null,
        };
      }),
      total,
      page: normalizedPage,
      limit: normalizedLimit,
      totalPages: Math.ceil(total / normalizedLimit),
    };
  }

  async deleteSavedParkingLocation(userId: string) {
    const saved = await this.prismaService.savedParkingLocation.findFirst({
      where: { userId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });

    if (!saved) {
      throw new NotFoundException('Saved parking location not found');
    }

    await this.prismaService.savedParkingLocation.update({
      where: { id: saved.id },
      data: { isActive: false },
    });

    return { message: 'Saved parking location deleted successfully' };
  }

  async createParkingSession(userId: string, dto: CreateParkingSessionDto) {
    this.validateCoordinates(dto.latitude, dto.longitude);

    const paidExpiresAt = this.resolvePaidParkingExpiry(
      dto.costType as ParkingCost,
      dto.durationMin,
      dto.expiresAt,
    );

    await this.prismaService.parkingSession.updateMany({
      where: { userId, status: 'ACTIVE' },
      data: { status: 'LEFT' },
    });

    const expiresAt =
      dto.costType === ParkingCost.PAID
        ? paidExpiresAt
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
    this.validateCoordinates(dto.centerLat, dto.centerLng);
    this.validatePolygon(dto.polygon);
    const parkingAreaTypes = this.normalizeParkingAreaTypes(dto.parkingAreaTypes);

    return this.prismaService.parkingArea.create({
      data: {
        name: dto.name,
        description: dto.description,
        centerLat: dto.centerLat,
        centerLng: dto.centerLng,
        polygon: dto.polygon as any,
        parkingCost: dto.parkingCost as any,
        parkingFee: dto.parkingFee,
        parkingAreaTypes: parkingAreaTypes as any,
        disabledFacilityLocation: this.resolveDisabledFacilityLocation(
          parkingAreaTypes,
          dto.disabledFacilityLocation,
        ) as any,
        totalSpots: dto.totalSpots,
        isActive: dto.isActive ?? true,
        createdById: adminId,
      },
    });
  }

  async submitParkingAreaPoint(userId: string, dto: SubmitParkingAreaPointDto) {
    this.validateCoordinates(dto.centerLat, dto.centerLng);
    const parkingAreaTypes = this.normalizeParkingAreaTypes(dto.parkingAreaTypes);

    return this.prismaService.parkingArea.create({
      data: {
        name: dto.name,
        description: dto.description,
        centerLat: dto.centerLat,
        centerLng: dto.centerLng,
        parkingCost: dto.parkingCost as any,
        parkingFee: dto.parkingFee,
        parkingAreaTypes: parkingAreaTypes as any,
        disabledFacilityLocation: this.resolveDisabledFacilityLocation(
          parkingAreaTypes,
          dto.disabledFacilityLocation,
        ) as any,
        totalSpots: dto.totalSpots,
        isActive: false,
        createdById: userId,
      },
    });
  }

  async getParkingAreas(page = 1, limit = 20, isActive?: boolean) {
    const skip = (Number(page) - 1) * Number(limit);
    const where = isActive !== undefined ? { isActive } : {};
    const [areas, total] = await Promise.all([
      this.prismaService.parkingArea.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
      }),
      this.prismaService.parkingArea.count({ where }),
    ]);

    return { areas, total, page: Number(page), limit: Number(limit) };
  }

  async searchParkingAreas(query: SearchParkingAreaDto) {
    const page = Math.max(Number(query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
    const skip = (page - 1) * limit;
    const where: any = {
      isActive: query.isActive ?? true,
    };
    const hasLatitude = query.latitude !== undefined;
    const hasLongitude = query.longitude !== undefined;

    if (query.query) {
      where.OR = [
        { name: { contains: query.query, mode: 'insensitive' } },
        { description: { contains: query.query, mode: 'insensitive' } },
      ];
    }

    if (query.parkingCost) {
      where.parkingCost = query.parkingCost;
    }

    if (query.parkingAreaTypes?.length) {
      where.parkingAreaTypes = { hasEvery: query.parkingAreaTypes };
    }

    if (query.disabledFacilityLocation) {
      where.disabledFacilityLocation = query.disabledFacilityLocation;
    }

    if (hasLatitude !== hasLongitude) {
      throw new BadRequestException('latitude and longitude must be provided together');
    }

    if (query.radiusMeters !== undefined && (!hasLatitude || !hasLongitude)) {
      throw new BadRequestException('radiusMeters requires latitude and longitude');
    }

    if (hasLatitude && hasLongitude) {
      this.validateCoordinates(query.latitude!, query.longitude!);
    }

    if (query.radiusMeters !== undefined) {
      this.validateParkingAreaSearchRadius(Number(query.radiusMeters));
    }

    const areas = await this.prismaService.parkingArea.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    const areasWithDistance = hasLatitude && hasLongitude
      ? areas
          .map((area) => ({
            ...area,
            distanceMeters: Math.round(
              this.geolocationService.calculateDistance(
                query.latitude!,
                query.longitude!,
                area.centerLat,
                area.centerLng,
              ),
            ),
            googleMapsLink: this.buildGoogleMapsLink(area.centerLat, area.centerLng, 'driving'),
          }))
          .filter((area) => (
            query.radiusMeters === undefined
              ? true
              : area.distanceMeters <= Number(query.radiusMeters)
          ))
          .sort((a, b) => a.distanceMeters - b.distanceMeters)
      : areas;

    return {
      areas: areasWithDistance.slice(skip, skip + limit),
      total: areasWithDistance.length,
      page,
      limit,
    };
  }

  async getNearbyParkingAreas(latitude: number, longitude: number, radiusMeters = 1000) {
    this.validateCoordinates(latitude, longitude);
    this.validateParkingAreaSearchRadius(Number(radiusMeters));

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

    const nextCenterLat = dto.centerLat ?? area.centerLat;
    const nextCenterLng = dto.centerLng ?? area.centerLng;
    if (dto.centerLat !== undefined || dto.centerLng !== undefined) {
      this.validateCoordinates(nextCenterLat, nextCenterLng);
    }

    const nextParkingAreaTypes = dto.parkingAreaTypes !== undefined
      ? this.normalizeParkingAreaTypes(dto.parkingAreaTypes)
      : area.parkingAreaTypes as ParkingAreaType[];

    return this.prismaService.parkingArea.update({
      where: { id: areaId },
      data: {
        name: dto.name,
        description: dto.description,
        centerLat: dto.centerLat,
        centerLng: dto.centerLng,
        polygon: dto.polygon as any,
        parkingCost: dto.parkingCost as any,
        parkingFee: dto.parkingFee,
        parkingAreaTypes: dto.parkingAreaTypes !== undefined
          ? nextParkingAreaTypes as any
          : undefined,
        disabledFacilityLocation: this.resolveDisabledFacilityLocation(
          nextParkingAreaTypes,
          dto.disabledFacilityLocation,
          area.disabledFacilityLocation as any,
        ) as any,
        totalSpots: dto.totalSpots,
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

  async createParkingAreaRating(
    userId: string,
    areaId: string,
    dto: CreateParkingAreaRatingDto,
  ) {
    await this.assertParkingAreaExists(areaId);

    const existingRating = await this.prismaService.parkingAreaRating.findUnique({
      where: {
        parkingAreaId_userId: {
          parkingAreaId: areaId,
          userId,
        },
      },
    });

    if (existingRating) {
      throw new BadRequestException('You have already rated this parking area');
    }

    const rating = await this.createParkingAreaRatingRecord(userId, areaId, dto);

    await this.refreshParkingAreaRatingSummary(areaId);

    return rating;
  }

  private async createParkingAreaRatingRecord(
    userId: string,
    areaId: string,
    dto: CreateParkingAreaRatingDto,
  ) {
    try {
      return await this.prismaService.parkingAreaRating.create({
        data: {
          parkingAreaId: areaId,
          userId,
          rating: dto.rating,
          review: dto.review,
        },
        include: {
          user: {
            select: {
              id: true,
              nick_name: true,
              avatar: true,
            },
          },
        },
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new BadRequestException('You have already rated this parking area');
      }
      throw error;
    }
  }

  async updateMyParkingAreaRating(
    userId: string,
    areaId: string,
    dto: UpdateParkingAreaRatingDto,
  ) {
    await this.assertParkingAreaExists(areaId);

    const existingRating = await this.prismaService.parkingAreaRating.findUnique({
      where: {
        parkingAreaId_userId: {
          parkingAreaId: areaId,
          userId,
        },
      },
    });

    if (!existingRating) {
      throw new NotFoundException('Parking area rating not found');
    }

    const rating = await this.prismaService.parkingAreaRating.update({
      where: { id: existingRating.id },
      data: {
        rating: dto.rating,
        review: dto.review,
      },
      include: {
        user: {
          select: {
            id: true,
            nick_name: true,
            avatar: true,
          },
        },
      },
    });

    await this.refreshParkingAreaRatingSummary(areaId);

    return rating;
  }

  async getParkingAreaRatings(areaId: string, page = 1, limit = 10) {
    await this.assertParkingAreaExists(areaId);

    const normalizedPage = Math.max(Number(page) || 1, 1);
    const normalizedLimit = Math.min(Math.max(Number(limit) || 10, 1), 100);
    const skip = (normalizedPage - 1) * normalizedLimit;

    const [ratings, total] = await Promise.all([
      this.prismaService.parkingAreaRating.findMany({
        where: { parkingAreaId: areaId },
        skip,
        take: normalizedLimit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              nick_name: true,
              avatar: true,
            },
          },
        },
      }),
      this.prismaService.parkingAreaRating.count({
        where: { parkingAreaId: areaId },
      }),
    ]);

    return {
      ratings,
      total,
      page: normalizedPage,
      limit: normalizedLimit,
      totalPages: Math.ceil(total / normalizedLimit),
    };
  }

  async getMyParkingAreaRating(userId: string, areaId: string) {
    await this.assertParkingAreaExists(areaId);

    const rating = await this.prismaService.parkingAreaRating.findUnique({
      where: {
        parkingAreaId_userId: {
          parkingAreaId: areaId,
          userId,
        },
      },
    });

    if (!rating) {
      throw new NotFoundException('Parking area rating not found');
    }

    return rating;
  }

  async getParkingAreaRatingSummary(areaId: string) {
    const area = await this.assertParkingAreaExists(areaId);

    return {
      parkingAreaId: area.id,
      rating: area.rating ?? 0,
      reviewCount: area.reviewCount,
    };
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

  private async resolveDistanceCoordinates(
    userId?: string,
    latitude?: number,
    longitude?: number,
  ) {
    const hasLatitude = latitude !== undefined && !Number.isNaN(latitude);
    const hasLongitude = longitude !== undefined && !Number.isNaN(longitude);

    if (hasLatitude || hasLongitude) {
      if (!hasLatitude || !hasLongitude) {
        throw new BadRequestException('latitude and longitude must be provided together');
      }

      this.validateCoordinates(latitude!, longitude!);

      return {
        latitude: latitude!,
        longitude: longitude!,
      };
    }

    if (!userId) {
      return null;
    }

    const [activeParkingSession, searchSession, savedParkingLocation, userLocation] =
      await Promise.all([
        this.prismaService.parkingSession.findFirst({
          where: { userId, status: 'ACTIVE' },
          orderBy: { createdAt: 'desc' },
          select: { latitude: true, longitude: true },
        }),
        this.prismaService.parkingSearchSession.findUnique({
          where: { userId },
          select: { latitude: true, longitude: true },
        }),
        this.prismaService.savedParkingLocation.findFirst({
          where: { userId, isActive: true },
          orderBy: { createdAt: 'desc' },
          select: { latitude: true, longitude: true },
        }),
        this.prismaService.userLocation.findUnique({
          where: { userId },
          select: { latitude: true, longitude: true },
        }),
      ]);

    return activeParkingSession ?? searchSession ?? savedParkingLocation ?? userLocation ?? null;
  }

  private async notifyParkingHandoffSeeker(
    seekerId: string,
    handoff: {
      id: string;
      latitude: number;
      longitude: number;
      approxLatitude?: number | null;
      approxLongitude?: number | null;
      expiresAt: Date;
    },
    distanceMeters: number,
  ) {
    const title = 'Parking spot opening nearby';
    const message = 'A driver is leaving a parking spot near you';
    const approximateLocation = this.getHandoffApproximateLocation(handoff);
    const payload = {
      handoffId: handoff.id,
      latitude: approximateLocation.latitude,
      longitude: approximateLocation.longitude,
      expiresAt: handoff.expiresAt,
      distanceMeters,
      hasExactLocation: false,
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

      // Real-time socket notification for online seekers
      this.socketRoomService?.emitToUser(
        seekerId,
        EMIT_EVENTS.PARK_RELAY_HANDOFF_NEARBY,
        payload,
      );

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

  private async resolveActiveParkingSpotId(userId: string): Promise<string | undefined> {
    const [activeSession, activeSaved] = await Promise.all([
      this.prismaService.parkingSession.findFirst({
        where: { userId, status: 'ACTIVE' },
        orderBy: { createdAt: 'desc' },
        select: { spotId: true },
      }),
      this.prismaService.savedParkingLocation.findFirst({
        where: { userId, isActive: true },
        orderBy: { createdAt: 'desc' },
        select: { spotId: true },
      }),
    ]);

    return activeSession?.spotId ?? activeSaved?.spotId ?? undefined;
  }

  private async assertNoUnexpiredHandoff(userId: string) {
    const existingHandoff = await this.prismaService.parkingHandoff.findFirst({
      where: {
        releaserId: userId,
        status: 'AVAILABLE',
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        expiresAt: true,
      },
    });

    if (!existingHandoff) {
      return;
    }

    const secondsRemaining = Math.max(
      1,
      Math.ceil((existingHandoff.expiresAt.getTime() - Date.now()) / 1000),
    );

    throw new BadRequestException({
      message: 'You already have an active parking handoff. Please wait until it expires before creating another one.',
      handoffId: existingHandoff.id,
      status: existingHandoff.status,
      expiresAt: existingHandoff.expiresAt,
      secondsRemaining,
    });
  }

  private async cleanupExpiredHandoffs() {
    await this.expireOldHandoffs();

    const result = await this.prismaService.parkingHandoff.deleteMany({
      where: {
        status: 'EXPIRED',
        expiresAt: { lt: new Date() },
      },
    });

    if (result.count > 0) {
      this.logger.log(`Removed ${result.count} expired parking handoff(s).`);
    }

    return result;
  }

  private async expireOldHandoffs() {
    const expiredHandoffs = await this.prismaService.parkingHandoff.findMany({
      where: {
        status: { in: ['AVAILABLE', 'ACCEPTED'] as any },
        expiresAt: { lt: new Date() },
      },
    });

    for (const handoff of expiredHandoffs) {
      const result = await this.prismaService.parkingHandoff.updateMany({
        where: {
          id: handoff.id,
          status: { in: ['AVAILABLE', 'ACCEPTED'] as any },
        },
        data: { status: 'EXPIRED' },
      });

      if (result.count === 0) {
        continue;
      }

      await this.updateParkRelayReputation(handoff.releaserId, 'expired');
      await this.notifyHandoffExpired(handoff.releaserId, handoff);
    }
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

  private async createSavedParkingLocationWithIndexFallback(
    userId: string,
    data: any,
  ) {
    try {
      return await this.prismaService.savedParkingLocation.create({ data });
    } catch (error: any) {
      if (!this.isLegacySavedParkingUserIdUniqueIndexError(error)) {
        throw error;
      }

      this.logger.warn(
        'saved_parking_locations_userId_key still exists in the database. Updating the existing saved parking location as a compatibility fallback. Run pnpm run fix:saved-parking-index to enable full parking history.',
      );

      const existingSavedParking = await this.prismaService.savedParkingLocation.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });

      if (!existingSavedParking) {
        throw error;
      }

      return this.prismaService.savedParkingLocation.update({
        where: { id: existingSavedParking.id },
        data,
      });
    }
  }

  private isLegacySavedParkingUserIdUniqueIndexError(error: any) {
    const target = error?.meta?.target;
    const targetText = Array.isArray(target) ? target.join(',') : String(target ?? '');

    return error?.code === 'P2002'
      && targetText.includes('saved_parking_locations_userId_key');
  }

  private async notifyHandoffExpired(
    userId: string,
    handoff: { id: string; expiresAt: Date },
  ) {
    const title = 'Parking handoff expired';
    const message = 'Your parking handoff expired without being completed.';

    try {
      await this.notificationEventService.createEvent({
        userId,
        eventType: NotificationEventTypeEnum.SYSTEM_NOTIFICATION,
        title,
        message,
        payload: {
          handoffId: handoff.id,
          expiresAt: handoff.expiresAt,
          type: 'PARK_RELAY_HANDOFF_EXPIRED',
        },
      });

      const user = await this.prismaService.user.findUnique({
        where: { id: userId },
        select: { fcm_token: true },
      });

      if (user?.fcm_token) {
        await this.firebaseClient.sendPushNotification(user.fcm_token, title, message);
      }
    } catch (error: any) {
      this.logger.error(`Failed to notify handoff releaser ${userId} of expiry: ${error.message}`);
    }
  }

  private resolvePaidParkingExpiry(
    parkingType?: ParkingCost,
    durationMin?: number,
    expiresAt?: string,
  ): Date | null {
    if (parkingType !== ParkingCost.PAID) {
      return null;
    }

    if (expiresAt) {
      const parsedExpiry = new Date(expiresAt);
      if (Number.isNaN(parsedExpiry.getTime())) {
        throw new BadRequestException('expiresAt must be a valid date');
      }

      if (parsedExpiry <= new Date()) {
        throw new BadRequestException('expiresAt must be in the future');
      }

      return parsedExpiry;
    }

    if (!durationMin || durationMin <= 0) {
      throw new BadRequestException('durationMin or expiresAt is required for paid parking sessions');
    }

    return new Date(Date.now() + durationMin * 60 * 1000);
  }

  private async createPendingPaidParkingPrompt(userId: string, savedParkingLocationId: string) {
    await this.prismaService.paidParkingPrompt.updateMany({
      where: { userId, status: 'PENDING' },
      data: {
        status: 'DISMISSED',
        answeredAt: new Date(),
      },
    });

    return this.prismaService.paidParkingPrompt.create({
      data: {
        userId,
        savedParkingLocationId,
        status: 'PENDING',
      },
    });
  }

  private async getOwnedPendingPaidParkingPrompt(userId: string, promptId: string) {
    const prompt = await this.prismaService.paidParkingPrompt.findUnique({
      where: { id: promptId },
    });

    if (!prompt) {
      throw new NotFoundException('Paid parking prompt not found');
    }

    if (prompt.userId !== userId) {
      throw new BadRequestException('You do not have permission to answer this prompt');
    }

    if (prompt.status !== 'PENDING') {
      throw new BadRequestException('This paid parking prompt has already been handled');
    }

    return prompt;
  }

  private async closeActiveParkingForUser(userId: string) {
    await Promise.all([
      this.prismaService.parkingSession.updateMany({
        where: { userId, status: 'ACTIVE' },
        data: { status: 'LEFT' },
      }),
      this.prismaService.savedParkingLocation.updateMany({
        where: { userId, isActive: true },
        data: { isActive: false },
      }),
    ]);
  }

  private async getParkingAreaSummariesBySpotIds(
    spotIds: Array<string | null | undefined>,
  ) {
    const uniqueIds = [...new Set(spotIds.filter((id): id is string => Boolean(id)))];

    if (uniqueIds.length === 0) {
      return new Map<string, {
        id: string;
        name: string | null;
        description: string | null;
        rating: number | null;
        reviewCount: number;
        totalSpots: number | null;
        parkingCost: ParkingCost | null;
        parkingFee: number | null;
        parkingAreaTypes: ParkingAreaType[];
        disabledFacilityLocation: DisabledFacilityLocation | null;
      }>();
    }

    const areas = await this.prismaService.parkingArea.findMany({
      where: { id: { in: uniqueIds } },
      select: {
        id: true,
        name: true,
        description: true,
        rating: true,
        reviewCount: true,
        totalSpots: true,
        parkingCost: true,
        parkingFee: true,
        parkingAreaTypes: true,
        disabledFacilityLocation: true,
      },
    });

    return new Map(areas.map((area) => [area.id, area] as const));
  }

  private attachParkingAreaSummary<T extends { spotId?: string | null }>(
    record: T,
    areasBySpotId: Map<string, unknown>,
  ) {
    return {
      ...record,
      parkingArea: record.spotId ? (areasBySpotId.get(record.spotId) ?? null) : null,
    };
  }

  private buildApproximateLocation(latitude: number, longitude: number) {
    return {
      latitude: Math.round((latitude + 0.0007) * 1000) / 1000,
      longitude: Math.round((longitude - 0.0007) * 1000) / 1000,
    };
  }

  private getHandoffApproximateLocation(handoff: {
    latitude: number;
    longitude: number;
    approxLatitude?: number | null;
    approxLongitude?: number | null;
  }) {
    if (handoff.approxLatitude !== null && handoff.approxLatitude !== undefined
      && handoff.approxLongitude !== null && handoff.approxLongitude !== undefined) {
      return {
        latitude: handoff.approxLatitude,
        longitude: handoff.approxLongitude,
      };
    }

    return this.buildApproximateLocation(handoff.latitude, handoff.longitude);
  }

  private canSeeExactHandoffLocation(
    handoff: { releaserId: string; seekerId?: string | null; status: string },
    userId?: string,
  ) {
    if (!userId) {
      return false;
    }

    if (handoff.releaserId === userId) {
      return true;
    }

    return handoff.seekerId === userId && ['ACCEPTED', 'FOUND', 'OCCUPIED'].includes(handoff.status);
  }

  private async updateParkRelayReputation(
    userId: string,
    outcome: 'found' | 'occupied' | 'cancelled' | 'expired',
  ) {
    const createData = {
      userId,
      successfulHandoffs: outcome === 'found' ? 1 : 0,
      occupiedReports: outcome === 'occupied' ? 1 : 0,
      cancelledHandoffs: outcome === 'cancelled' ? 1 : 0,
      expiredHandoffs: outcome === 'expired' ? 1 : 0,
    };

    const updateData = {
      ...(outcome === 'found' ? { successfulHandoffs: { increment: 1 } } : {}),
      ...(outcome === 'occupied' ? { occupiedReports: { increment: 1 } } : {}),
      ...(outcome === 'cancelled' ? { cancelledHandoffs: { increment: 1 } } : {}),
      ...(outcome === 'expired' ? { expiredHandoffs: { increment: 1 } } : {}),
    };

    const reputation = await this.prismaService.parkRelayReputation.upsert({
      where: { userId },
      create: createData,
      update: updateData,
    });

    return this.prismaService.parkRelayReputation.update({
      where: { userId },
      data: { score: this.calculateParkRelayReputationScore(reputation) },
    });
  }

  private calculateParkRelayReputationScore(reputation: {
    successfulHandoffs: number;
    occupiedReports: number;
    cancelledHandoffs: number;
    expiredHandoffs: number;
  }) {
    const total = reputation.successfulHandoffs
      + reputation.occupiedReports
      + reputation.cancelledHandoffs
      + reputation.expiredHandoffs;

    if (total === 0) {
      return 0;
    }

    const rawScore = (
      reputation.successfulHandoffs
      - reputation.occupiedReports * 2
      - reputation.cancelledHandoffs
      - reputation.expiredHandoffs
    ) / total;

    return Math.max(-1, Math.min(1, Number(rawScore.toFixed(2))));
  }

  private normalizeParkingAreaTypes(parkingAreaTypes?: string[]) {
    return Array.from(new Set(parkingAreaTypes ?? [])) as ParkingAreaType[];
  }

  private resolveDisabledFacilityLocation(
    parkingAreaTypes: ParkingAreaType[],
    disabledFacilityLocation?: DisabledFacilityLocation | null,
    existingDisabledFacilityLocation?: DisabledFacilityLocation | null,
  ) {
    if (!parkingAreaTypes.includes(ParkingAreaType.DISABLED_FACILITY)) {
      return null;
    }

    return disabledFacilityLocation
      ?? existingDisabledFacilityLocation
      ?? DisabledFacilityLocation.ALL;
  }

  private validateParkingAreaSearchRadius(radiusMeters: number) {
    if (Number.isNaN(radiusMeters)) {
      throw new BadRequestException('radiusMeters must be a number');
    }

    if (radiusMeters < 100 || radiusMeters > 20000) {
      throw new BadRequestException('radiusMeters must be between 100 and 20000');
    }
  }

  private async assertParkingAreaExists(areaId: string) {
    const area = await this.prismaService.parkingArea.findUnique({
      where: { id: areaId },
    });

    if (!area) {
      throw new NotFoundException('Parking area not found');
    }

    return area;
  }

  private async refreshParkingAreaRatingSummary(areaId: string) {
    const aggregate = await this.prismaService.parkingAreaRating.aggregate({
      where: { parkingAreaId: areaId },
      _avg: { rating: true },
      _count: { rating: true },
    });

    const rating = aggregate._avg.rating === null
      ? null
      : Math.round(aggregate._avg.rating * 10) / 10;

    return this.prismaService.parkingArea.update({
      where: { id: areaId },
      data: {
        rating,
        reviewCount: aggregate._count.rating,
      },
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
