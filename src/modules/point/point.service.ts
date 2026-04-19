import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePointDto } from './dtos/create-point.dto';
import { UpdatePointDto } from './dtos/update-point.dto';

@Injectable()
export class PointService {
  constructor(private readonly prismaService: PrismaService) {}

  async createPoint(createPointDto: CreatePointDto) {
    return this.prismaService.point.create({
      data: {
        name: createPointDto.name,
        description: createPointDto.description,
        latitude: createPointDto.latitude,
        longitude: createPointDto.longitude,
      },
    });
  }

  async getAllPoints(page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;

    const [points, total] = await Promise.all([
      this.prismaService.point.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prismaService.point.count(),
    ]);

    return { points, total, page, limit };
  }

  async getPointById(id: string) {
    const point = await this.prismaService.point.findUnique({
      where: { id },
    });

    if (!point) {
      throw new NotFoundException(`Point with ID ${id} not found`);
    }

    return point;
  }

  async updatePoint(id: string, updatePointDto: UpdatePointDto) {
    const existingPoint = await this.prismaService.point.findUnique({
      where: { id },
    });

    if (!existingPoint) {
      throw new NotFoundException(`Point with ID ${id} not found`);
    }

    return this.prismaService.point.update({
      where: { id },
      data: updatePointDto,
    });
  }

  async deletePoint(id: string) {
    const existingPoint = await this.prismaService.point.findUnique({
      where: { id },
    });

    if (!existingPoint) {
      throw new NotFoundException(`Point with ID ${id} not found`);
    }

    await this.prismaService.point.delete({
      where: { id },
    });

    return { message: 'Point deleted successfully' };
  }

  async searchPointsByLocation(latitude: number, longitude: number, radiusKm: number = 10, page: number = 1, limit: number = 10) {
    // Simple distance calculation (Haversine formula for approximate distance)
    // For production, consider using PostGIS or similar for better geospatial queries
    const skip = (page - 1) * limit;

    const points = await this.prismaService.point.findMany({
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    });

    // Filter by distance on application level (MongoDB doesn't have built-in geospatial queries in basic setup)
    const filteredPoints = points.filter((point) => {
      const distance = this.calculateDistance(latitude, longitude, point.latitude, point.longitude);
      return distance <= radiusKm;
    });

    const total = await this.prismaService.point.count();

    return { points: filteredPoints, total, page, limit, radiusKm };
  }

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  async searchPointsByName(query: string, page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;

    const [points, total] = await Promise.all([
      this.prismaService.point.findMany({
        where: {
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } },
          ],
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prismaService.point.count({
        where: {
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } },
          ],
        },
      }),
    ]);

    return { points, total, page, limit };
  }
}
