import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateUserLocationDto } from '../../modules/user/dtos/update-user-location.dto';
import { CreatePointDto } from '../../modules/point/dtos/create-point.dto';
import {
  ParkingCoordinatesDto,
  CreateParkingAreaDto,
} from '../../modules/park-relay/dtos/park-relay.dto';
import { ParkingCost } from '../enums';

/**
 * Guards against a future @Transform/@Type or validator option (e.g.
 * maxDecimalPlaces) silently rounding coordinates before they reach the
 * database. Latitude/longitude must survive DTO validation/transform
 * byte-for-byte.
 */
describe('coordinate precision through DTO validation', () => {
  const HIGH_PRECISION_LAT = 23.810331123456789;
  const HIGH_PRECISION_LNG = 90.412518987654321;

  it('preserves full precision on UpdateUserLocationDto', async () => {
    const dto = plainToInstance(UpdateUserLocationDto, {
      latitude: HIGH_PRECISION_LAT,
      longitude: HIGH_PRECISION_LNG,
    });

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.latitude).toBe(HIGH_PRECISION_LAT);
    expect(dto.longitude).toBe(HIGH_PRECISION_LNG);
  });

  it('preserves full precision on CreatePointDto', async () => {
    const dto = plainToInstance(CreatePointDto, {
      name: 'Test point',
      latitude: HIGH_PRECISION_LAT,
      longitude: HIGH_PRECISION_LNG,
    });

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.latitude).toBe(HIGH_PRECISION_LAT);
    expect(dto.longitude).toBe(HIGH_PRECISION_LNG);
  });

  it('preserves full precision on ParkingCoordinatesDto', async () => {
    const dto = plainToInstance(ParkingCoordinatesDto, {
      latitude: HIGH_PRECISION_LAT,
      longitude: HIGH_PRECISION_LNG,
    });

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.latitude).toBe(HIGH_PRECISION_LAT);
    expect(dto.longitude).toBe(HIGH_PRECISION_LNG);
  });

  it('preserves full precision on CreateParkingAreaDto', async () => {
    const dto = plainToInstance(CreateParkingAreaDto, {
      centerLat: HIGH_PRECISION_LAT,
      centerLng: HIGH_PRECISION_LNG,
      parkingCost: ParkingCost.FREE,
      polygon: [
        { latitude: HIGH_PRECISION_LAT, longitude: HIGH_PRECISION_LNG },
        { latitude: HIGH_PRECISION_LAT + 0.001, longitude: HIGH_PRECISION_LNG },
        { latitude: HIGH_PRECISION_LAT, longitude: HIGH_PRECISION_LNG + 0.001 },
      ],
    });

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.centerLat).toBe(HIGH_PRECISION_LAT);
    expect(dto.centerLng).toBe(HIGH_PRECISION_LNG);
    expect(dto.polygon[0].latitude).toBe(HIGH_PRECISION_LAT);
    expect(dto.polygon[0].longitude).toBe(HIGH_PRECISION_LNG);
  });
});
