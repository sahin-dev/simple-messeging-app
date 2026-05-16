import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../modules/prisma/prisma.service';

@Injectable()
export class GeolocationService {
  // Earth's radius in meters
  private readonly EARTH_RADIUS_METERS = 6371000;

  constructor(private readonly prismaService: PrismaService) {}

  /**
   * Calculate distance between two geographic coordinates using Haversine formula
   * @param lat1 - Latitude of first point
   * @param lon1 - Longitude of first point
   * @param lat2 - Latitude of second point
   * @param lon2 - Longitude of second point
   * @returns Distance in meters
   */
  calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const toRad = (degree: number) => (degree * Math.PI) / 180;

    const φ1 = toRad(lat1);
    const φ2 = toRad(lat2);
    const Δφ = toRad(lat2 - lat1);
    const Δλ = toRad(lon2 - lon1);

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) *
        Math.cos(φ2) *
        Math.sin(Δλ / 2) *
        Math.sin(Δλ / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = this.EARTH_RADIUS_METERS * c;

    return distance;
  }

  /**
   * Find all users within a specified radius of a location
   * @param centerLat - Center latitude
   * @param centerLon - Center longitude
   * @param radiusMeters - Search radius in meters
   * @param excludeUserId - Optional user ID to exclude from results
   * @returns Array of users within radius with their distances
   */
  async findUsersWithinRadius(
    centerLat: number,
    centerLon: number,
    radiusMeters: number,
    excludeUserId?: string,
  ): Promise<
    Array<{
      id: string;
      name: string;
      nick_name: string;
      email: string;
      fcm_token: string | null;
      distance: number;
    }>
  > {
    // Get all users with their locations
    const userLocations = await this.prismaService.userLocation.findMany({
      include: {
        user: {
          select: {
            id: true,
            name: true,
            nick_name: true,
            email: true,
            fcm_token: true,
            is_blocked: true,
            is_deleted: true,
          },
        },
      },
    });

    // Filter users within radius
    const usersInRadius = userLocations
      .filter((location) => {
        // Skip excluded user
        if (excludeUserId && location.user.id === excludeUserId) {
          return false;
        }

        // Skip blocked or deleted users
        if (location.user.is_blocked || location.user.is_deleted) {
          return false;
        }

        const distance = this.calculateDistance(
          centerLat,
          centerLon,
          location.latitude,
          location.longitude,
        );

        return distance <= radiusMeters;
      })
      .map((location) => ({
        id: location.user.id,
        name: location.user.name || '',
        nick_name: location.user.nick_name,
        email: location.user.email,
        fcm_token: location.user.fcm_token,
        distance: this.calculateDistance(
          centerLat,
          centerLon,
          location.latitude,
          location.longitude,
        ),
      }));

    return usersInRadius;
  }

  /**
   * Update or create user's current location
   * @param userId - User ID
   * @param latitude - Current latitude
   * @param longitude - Current longitude
   * @param accuracy - Optional accuracy in meters
   */
  async updateUserLocation(
    userId: string,
    latitude: number,
    longitude: number,
    accuracy?: number,
  ): Promise<any> {
    return this.prismaService.userLocation.upsert({
      where: { userId },
      create: {
        userId,
        latitude,
        longitude,
        accuracy,
      },
      update: {
        latitude,
        longitude,
        accuracy,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Get user's current location
   * @param userId - User ID
   */
  async getUserLocation(userId: string): Promise<any> {
    return this.prismaService.userLocation.findUnique({
      where: { userId },
    });
  }

  /**
   * Check if user is within specified distance of a location
   * @param userId - User ID
   * @param centerLat - Center latitude
   * @param centerLon - Center longitude
   * @param radiusMeters - Distance in meters
   */
  async isUserWithinRadius(
    userId: string,
    centerLat: number,
    centerLon: number,
    radiusMeters: number,
  ): Promise<boolean> {
    const userLocation = await this.getUserLocation(userId);

    if (!userLocation) {
      return false;
    }

    const distance = this.calculateDistance(
      centerLat,
      centerLon,
      userLocation.latitude,
      userLocation.longitude,
    );

    return distance <= radiusMeters;
  }

  /**
   * Get nearest parking spots for a user
   * @param userId - User ID
   * @param limit - Number of results to return
   */
  async getNearestParkingSpots(userId: string, limit: number = 10): Promise<any[]> {
    const userLocation = await this.getUserLocation(userId);

    if (!userLocation) {
      return [];
    }

    // Get all active parking reports
    const parkingReports = await this.prismaService.parkingReport.findMany({
      where: {
        is_active: true,
        expiresAt: {
          gte: new Date(), // Only non-expired reports
        },
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

    // Calculate distance for each parking spot
    const parkingWithDistance = parkingReports
      .map((report) => ({
        ...report,
        distance: this.calculateDistance(
          userLocation.latitude,
          userLocation.longitude,
          report.latitude,
          report.longitude,
        ),
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, limit);

    return parkingWithDistance;
  }

  /**
   * Validate coordinates are within valid ranges
   * @param latitude - Latitude value
   * @param longitude - Longitude value
   */
  validateCoordinates(latitude: number, longitude: number): boolean {
    const latValid = latitude >= -90 && latitude <= 90;
    const lonValid = longitude >= -180 && longitude <= 180;
    return latValid && lonValid;
  }

  /**
   * Convert decimal degrees to DMS (Degrees, Minutes, Seconds)
   * Useful for display purposes
   * @param coordinate - Coordinate in decimal degrees
   */
  decimalToDMS(coordinate: number): string {
    const absolute = Math.abs(coordinate);
    const degrees = Math.floor(absolute);
    const minutesDecimal = (absolute - degrees) * 60;
    const minutes = Math.floor(minutesDecimal);
    const seconds = ((minutesDecimal - minutes) * 60).toFixed(2);

    return `${degrees}° ${minutes}' ${seconds}"`;
  }
}
