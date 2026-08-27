import { BadRequestException } from '@nestjs/common';
import { ParkRelayService } from './park-relay.service';

describe('ParkRelayService map viewport', () => {
  const makeService = () => {
    const parkingArea = {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    };
    const prisma = { parkingArea };
    const geolocation = {
      validateCoordinates: jest.fn().mockReturnValue(true),
    };

    return {
      parkingArea,
      service: new ParkRelayService(
        prisma as any,
        geolocation as any,
        {} as any,
        {} as any,
      ),
    };
  };

  it('queries only centers inside ordinary map bounds', async () => {
    const { parkingArea, service } = makeService();

    await service.getParkingAreasInViewport({
      north: 24,
      south: 23,
      east: 91,
      west: 90,
      limit: 50,
    });

    expect(parkingArea.findMany).toHaveBeenCalledWith({
      where: {
        isActive: true,
        centerLat: { gte: 23, lte: 24 },
        centerLng: { gte: 90, lte: 91 },
      },
      take: 50,
      orderBy: { createdAt: 'desc' },
    });
  });

  it('supports a viewport crossing the antimeridian', async () => {
    const { parkingArea, service } = makeService();

    await service.getParkingAreasInViewport({
      north: 10,
      south: -10,
      east: -170,
      west: 170,
    });

    expect(parkingArea.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { centerLng: { gte: 170 } },
            { centerLng: { lte: -170 } },
          ],
        }),
      }),
    );
  });

  it('rejects inverted latitude bounds', async () => {
    const { service } = makeService();

    await expect(
      service.getParkingAreasInViewport({
        north: 23,
        south: 24,
        east: 91,
        west: 90,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
