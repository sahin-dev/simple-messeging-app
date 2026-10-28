import { ParkRelayService } from './park-relay.service';

/**
 * Guards against latitude/longitude being rounded before persistence.
 * The only intentional rounding in this service is buildApproximateLocation,
 * which must only ever populate approxLatitude/approxLongitude — never the
 * real latitude/longitude columns.
 */
describe('ParkRelayService coordinate precision', () => {
  const HIGH_PRECISION_LAT = 23.810331123456789;
  const HIGH_PRECISION_LNG = 90.412518987654321;

  const makeService = () => {
    const parkingSearchSession = {
      upsert: jest.fn().mockResolvedValue({}),
    };
    const prisma = { parkingSearchSession };
    const geolocation = {
      validateCoordinates: jest.fn().mockReturnValue(true),
    };

    return {
      parkingSearchSession,
      service: new ParkRelayService(
        prisma as any,
        geolocation as any,
        {} as any,
        {} as any,
      ),
    };
  };

  it('startSearching persists the exact latitude/longitude given', async () => {
    const { parkingSearchSession, service } = makeService();

    await service.startSearching('user-1', {
      latitude: HIGH_PRECISION_LAT,
      longitude: HIGH_PRECISION_LNG,
    });

    expect(parkingSearchSession.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          latitude: HIGH_PRECISION_LAT,
          longitude: HIGH_PRECISION_LNG,
        }),
        update: expect.objectContaining({
          latitude: HIGH_PRECISION_LAT,
          longitude: HIGH_PRECISION_LNG,
        }),
      }),
    );
  });

  it('markParked persists the exact latitude/longitude given', async () => {
    const { parkingSearchSession, service } = makeService();

    await service.markParked('user-1', {
      latitude: HIGH_PRECISION_LAT,
      longitude: HIGH_PRECISION_LNG,
    });

    expect(parkingSearchSession.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          latitude: HIGH_PRECISION_LAT,
          longitude: HIGH_PRECISION_LNG,
        }),
      }),
    );
  });

  it('getNearbyHandoffs returns the exact latitude/longitude of each handoff', async () => {
    const parkingHandoff = {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'handoff-1',
          spotId: null,
          status: 'AVAILABLE',
          expiresAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
          releaserId: 'releaser-1',
          latitude: HIGH_PRECISION_LAT,
          longitude: HIGH_PRECISION_LNG,
          approxLatitude: 23.811,
          approxLongitude: 90.412,
        },
      ]),
    };
    const parkingArea = { findMany: jest.fn().mockResolvedValue([]) };
    const prisma = { parkingHandoff, parkingArea };
    const geolocation = {
      validateCoordinates: jest.fn().mockReturnValue(true),
      calculateDistance: jest.fn().mockReturnValue(50),
    };

    const service = new ParkRelayService(
      prisma as any,
      geolocation as any,
      {} as any,
      {} as any,
    );

    // Avoid the real setInterval-driven expiry sweep touching prisma models we didn't mock.
    jest.spyOn(service as any, 'expireOldHandoffs').mockResolvedValue(undefined);

    const results = await service.getNearbyHandoffs(
      'seeker-1',
      HIGH_PRECISION_LAT,
      HIGH_PRECISION_LNG,
    );

    expect(results).toHaveLength(1);
    expect(results[0].latitude).toBe(HIGH_PRECISION_LAT);
    expect(results[0].longitude).toBe(HIGH_PRECISION_LNG);
    expect(results[0].hasExactLocation).toBe(true);
  });

  it('buildApproximateLocation never returns the exact input value', () => {
    const { service } = makeService();

    const approx = (service as any).buildApproximateLocation(
      HIGH_PRECISION_LAT,
      HIGH_PRECISION_LNG,
    );

    // This fuzzing must stay confined to approxLatitude/approxLongitude —
    // it must never be used to populate the real latitude/longitude fields.
    expect(approx.latitude).not.toBe(HIGH_PRECISION_LAT);
    expect(approx.longitude).not.toBe(HIGH_PRECISION_LNG);
  });
});
