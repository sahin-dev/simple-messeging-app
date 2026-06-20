import { Test, TestingModule } from '@nestjs/testing';
import { ParkingReportService } from './parking-report.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationDispatcherService } from '../notification/services/notification-dispatcher.service';
import { GeolocationService } from '../../common/services/geolocation.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { DisabledFacilityLocation } from 'generated/prisma/enums';

describe('ParkingReportService - Simplified Constraints', () => {
  let service: ParkingReportService;
  let prismaService: any;
  let geolocationService: any;
  let notificationDispatcherService: any;

  const mockPrismaService = {
    parkingSpot: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    parkingReport: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    parkingNotificationCredit: {
      create: jest.fn(),
    },
  };

  const mockNotificationDispatcherService = {
    dispatchParkingLeaveNotification: jest.fn().mockResolvedValue(undefined),
    dispatchParkingNotification: jest.fn().mockResolvedValue(undefined),
  };

  const mockGeolocationService = {
    getUserLocation: jest.fn(),
    calculateDistance: jest.fn(),
    validateCoordinates: jest.fn().mockReturnValue(true),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ParkingReportService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: NotificationDispatcherService, useValue: mockNotificationDispatcherService },
        { provide: GeolocationService, useValue: mockGeolocationService },
      ],
    }).compile();

    service = module.get<ParkingReportService>(ParkingReportService);
    prismaService = module.get<PrismaService>(PrismaService);
    geolocationService = module.get<GeolocationService>(GeolocationService);
    notificationDispatcherService = module.get<NotificationDispatcherService>(NotificationDispatcherService);
  });

  describe('createParkingReport', () => {
    const userId = 'user123';
    const spotId = 'spot123';
    const dto = {
      spotId,
      latitude: 10.0,
      longitude: 20.0,
      parking_cost: 'FREE' as any,
      electric_charging: false,
      disabled_facility: false,
      disabled_facility_location: 'NONE' as any,
    };

    it('should create a parking report if spot exists, user is within 10m, and no report in last 10m', async () => {
      const mockSpot = {
        id: spotId,
        latitude: 10.0,
        longitude: 20.0,
        is_active: true,
        parking_cost: 'FREE',
        electric_charging: false,
        disabled_facility: false,
        disabled_facility_location: 'NONE',
      };

      prismaService.parkingSpot.findUnique.mockResolvedValue(mockSpot);
      prismaService.parkingReport.findFirst.mockResolvedValue(null); // No recent reports
      geolocationService.getUserLocation.mockResolvedValue({ latitude: 10.00001, longitude: 20.0 });
      geolocationService.calculateDistance.mockReturnValue(5.0); // 5 meters

      prismaService.parkingSpot.update.mockResolvedValue(mockSpot);
      prismaService.parkingReport.create.mockResolvedValue({
        id: 'report123',
        createdAt: new Date(),
        ...dto,
      });

      const result = await service.createParkingReport(userId, dto);

      expect(result).toBeDefined();
      expect(prismaService.parkingReport.create).toHaveBeenCalled();
    });

    it('should throw BadRequestException if a report was submitted for the same spot in the last 10 minutes', async () => {
      const mockSpot = { id: spotId, latitude: 10, longitude: 20 };
      prismaService.parkingSpot.findUnique.mockResolvedValue(mockSpot);
      prismaService.parkingReport.findFirst.mockResolvedValue({ id: 'existingReportId' }); // Recent report exists

      await expect(service.createParkingReport(userId, dto)).rejects.toThrow(
        new BadRequestException('You cannot submit a report for the same spot within 10 minutes'),
      );
    });

    it('should throw BadRequestException if user location is not found', async () => {
      const mockSpot = { id: spotId, latitude: 10, longitude: 20 };
      prismaService.parkingSpot.findUnique.mockResolvedValue(mockSpot);
      prismaService.parkingReport.findFirst.mockResolvedValue(null);
      geolocationService.getUserLocation.mockResolvedValue(null); // Location missing

      await expect(service.createParkingReport(userId, dto)).rejects.toThrow(
        new BadRequestException('User location not found. Please update your location first.'),
      );
    });

    it('should throw BadRequestException if user is > 10m away from spot', async () => {
      const mockSpot = { id: spotId, latitude: 10.0, longitude: 20.0 };
      prismaService.parkingSpot.findUnique.mockResolvedValue(mockSpot);
      prismaService.parkingReport.findFirst.mockResolvedValue(null);
      geolocationService.getUserLocation.mockResolvedValue({ latitude: 11.0, longitude: 21.0 });
      geolocationService.calculateDistance.mockReturnValue(15.0); // 15 meters away

      await expect(service.createParkingReport(userId, dto)).rejects.toThrow(
        new BadRequestException('You must be within 10 meters of the parking spot to generate a report'),
      );
    });

    it('should force parking_cost to FREE when disabled_facility is true', async () => {
      const mockSpot = {
        id: spotId,
        latitude: 10.0,
        longitude: 20.0,
        is_active: true,
        parking_cost: 'PAID',
        electric_charging: false,
        disabled_facility: false,
        disabled_facility_location: 'NONE',
      };

      prismaService.parkingSpot.findUnique.mockResolvedValue(mockSpot);
      prismaService.parkingReport.findFirst.mockResolvedValue(null);
      geolocationService.getUserLocation.mockResolvedValue({ latitude: 10.00001, longitude: 20.0 });
      geolocationService.calculateDistance.mockReturnValue(5.0);

      const dtoWithDisabled = {
        ...dto,
        parking_cost: 'PAID' as any,
        disabled_facility: true,
      };

      prismaService.parkingSpot.update.mockResolvedValue(mockSpot);
      prismaService.parkingReport.create.mockImplementation((args: any) => {
        return {
          id: 'report_disabled',
          createdAt: new Date(),
          ...args.data,
        };
      });

      const result = await service.createParkingReport(userId, dtoWithDisabled);

      expect(result.parking_cost).toBe('FREE');
      expect(prismaService.parkingSpot.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: spotId },
          data: expect.objectContaining({
            parking_cost: 'FREE',
          }),
        }),
      );
    });
  });

  describe('reserveParkingSpot (reverted to original)', () => {
    it('should reserve spot without checking distance or active reservations', async () => {
      const mockSpot = { id: 'spot123', is_active: true, available: true, latitude: 10.0, longitude: 20.0 };
      prismaService.parkingSpot.findUnique.mockResolvedValue(mockSpot);
      prismaService.parkingSpot.update.mockResolvedValue({ ...mockSpot, available: false });

      const result = await service.reserveParkingSpot('user123', 'spot123');

      expect(result.available).toBe(false);
      // Ensure distance was NOT checked
      expect(geolocationService.calculateDistance).not.toHaveBeenCalled();
    });
  });

  describe('leaveParkingSpot', () => {
    const mockSpot = {
      id: 'spot123',
      is_active: true,
      available: false,
      latitude: 10.0,
      longitude: 20.0,
      parking_cost: 'FREE',
      electric_charging: false,
      disabled_facility: false,
      disabled_facility_location: null,
    };

    it('should return existing report if user already reported leave for same spot within 10 minutes', async () => {
      prismaService.parkingSpot.findUnique.mockResolvedValue(mockSpot);
      prismaService.parkingReport.findFirst.mockResolvedValue({ id: 'existingReport' });

      const result = await service.leaveParkingSpot('user123', 'spot123');
      expect(result).toEqual({ id: 'existingReport' });
    });

    it('should create a leave report and make spot available if no recent leave report exists', async () => {
      prismaService.parkingSpot.findUnique.mockResolvedValue(mockSpot);
      prismaService.parkingReport.findFirst.mockResolvedValue(null); // No recent leave
      prismaService.parkingReport.create.mockResolvedValue({ id: 'newLeaveReport' });
      prismaService.parkingSpot.update.mockResolvedValue({ ...mockSpot, available: true });
      prismaService.user.findUnique.mockResolvedValue({ id: 'user123', nick_name: 'Alice' });
      prismaService.user.update.mockResolvedValue({ id: 'user123', parking_notifications_available: 3 });
      prismaService.parkingNotificationCredit.create.mockResolvedValue({});

      const result = await service.leaveParkingSpot('user123', 'spot123');

      expect(result.available).toBe(true);
      expect(result.leaveReportId).toBe('newLeaveReport');
      expect(prismaService.parkingReport.create).toHaveBeenCalled();
      expect(prismaService.parkingSpot.update).toHaveBeenCalledWith({
        where: { id: 'spot123' },
        data: { available: true },
      });
    });
  });
});
