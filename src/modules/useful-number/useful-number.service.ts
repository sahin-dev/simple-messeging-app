import { BadRequestException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUsefulNumberDto } from './dtos/create-useful-number.dto';
import { UpdateUsefulNumberDto } from './dtos/update-useful-number.dto';

@Injectable()
export class UsefulNumberService {
  constructor(private readonly prismaService: PrismaService) {}

  async createUsefulNumber(createUsefulNumberDto: CreateUsefulNumberDto) {
    return this.prismaService.usefullNumber.create({
      data: {
        title: createUsefulNumberDto.title,
        phone: createUsefulNumberDto.phone,
        location: {
          latitude: createUsefulNumberDto.latitude,
          longitude: createUsefulNumberDto.longitude,
        },
        geolocation: {
          type: 'Point',
          coordinates: [createUsefulNumberDto.longitude, createUsefulNumberDto.latitude],
        },
      },
    });
  }

  async getAllUsefulNumbers(page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;

    const [numbers, total] = await Promise.all([
      this.prismaService.usefullNumber.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prismaService.usefullNumber.count(),
    ]);

    return { numbers, total, page, limit };
  }

  async getUsefulNumberById(id: string) {
    const number = await this.prismaService.usefullNumber.findUnique({
      where: { id },
    });

    if (!number) {
      throw new NotFoundException(`Useful number with ID ${id} not found`);
    }

    return number;
  }

  async updateUsefulNumber(id: string, updateUsefulNumberDto: UpdateUsefulNumberDto) {
    const existingNumber = await this.prismaService.usefullNumber.findUnique({
      where: { id },
    });

    if (!existingNumber) {
      throw new NotFoundException(`Useful number with ID ${id} not found`);
    }

    const data: any = {};

    if (updateUsefulNumberDto.title) data.title = updateUsefulNumberDto.title;
    if (updateUsefulNumberDto.phone) data.phone = updateUsefulNumberDto.phone;

    if (updateUsefulNumberDto.latitude !== undefined || updateUsefulNumberDto.longitude !== undefined) {
      const latitude = updateUsefulNumberDto.latitude ?? existingNumber.location.latitude;
      const longitude = updateUsefulNumberDto.longitude ?? existingNumber.location.longitude;
      
      data.location = {
        latitude,
        longitude,
      };
      
      data.geolocation = {
        type: 'Point',
        coordinates: [longitude, latitude],
      };
    }

    return this.prismaService.usefullNumber.update({
      where: { id },
      data,
    });
  }

  async deleteUsefulNumber(id: string) {
    const existingNumber = await this.prismaService.usefullNumber.findUnique({
      where: { id },
    });

    if (!existingNumber) {
      throw new NotFoundException(`Useful number with ID ${id} not found`);
    }

    await this.prismaService.usefullNumber.delete({
      where: { id },
    });

    return { message: 'Useful number deleted successfully' };
  }

  async searchUsefulNumbers(query: string, page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;

    const [numbers, total] = await Promise.all([
      this.prismaService.usefullNumber.findMany({
        where: {
          OR: [
            { title: { contains: query, mode: 'insensitive' } },
            { phone: { contains: query, mode: 'insensitive' } },
          ],
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prismaService.usefullNumber.count({
        where: {
          OR: [
            { title: { contains: query, mode: 'insensitive' } },
            { phone: { contains: query, mode: 'insensitive' } },
          ],
        },
      }),
    ]);

    return { numbers, total, page, limit };
  }

  // async searchNearbyUsefulNumbers(
  //   latitude: number,
  //   longitude: number,
  //   radiusInMeters: number = 1000,
  //   page: number = 1,
  //   limit: number = 10,
  // ) {
  //   const skip = (page - 1) * limit;

  //   try {
  //     const [numbers, totalResult] = await Promise.all([
  //       this.prismaService.$runCommandRaw({
  //         aggregate: 'useful_numbers',
  //         pipeline: [
  //           {
  //             $geoNear: {
  //               near: {
  //                 type: 'Point',
  //                 coordinates: [longitude, latitude],
  //               },
  //               distanceField: 'distance',
  //               maxDistance: radiusInMeters,
  //               spherical: true,
  //             },
  //           },
  //           { $skip: skip },
  //           { $limit: limit },
  //         ],
  //         cursor: {},
  //       } as any),
  //       this.prismaService.$runCommandRaw({
  //         aggregate: 'useful_numbers',
  //         pipeline: [
  //           {
  //             $geoNear: {
  //               near: {
  //                 type: 'Point',
  //                 coordinates: [longitude, latitude],
  //               },
  //               distanceField: 'distance',
  //               maxDistance: radiusInMeters,
  //               spherical: true,
  //             },
  //           },
  //           {
  //             $count: 'total',
  //           },
  //         ],
  //         cursor: {},
  //       } as any),
  //     ]);

  //     const totalCount = Array.isArray(totalResult) && totalResult.length > 0 ? totalResult[0].total : 0;

  //     return {
  //       numbers: Array.isArray(numbers) ? numbers : [],
  //       total: totalCount,
  //       page,
  //       limit,
  //       radiusInMeters,
  //       userLocation: {
  //         latitude,
  //         longitude,
  //       },
  //     };
  //   } catch (error: any) {
  //     throw new InternalServerErrorException(`Failed to search nearby useful numbers: ${error.message}`);
  //   }
  // }

  async searchNearbyUsefulNumbers(
  latitude: number,
  longitude: number,
  radiusInMeters: number = 1000,
  page: number = 1,
  limit: number = 10,
) {
  // Validate pagination
  page = Math.max(1, page);
  limit = Math.max(1, Math.min(limit, 100));

  // Validate coordinates
  if (
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new BadRequestException('Invalid latitude or longitude');
  }

  const skip = (page - 1) * limit;

  try {
    const result = await this.prismaService.$runCommandRaw({
      aggregate: 'useful_numbers',
      pipeline: [
        {
          $geoNear: {
            near: {
              type: 'Point',
              coordinates: [longitude, latitude],
            },
            distanceField: 'distance',
            maxDistance: radiusInMeters,
            spherical: true,
          },
        },

        // Optional sorting
        {
          $sort: {
            distance: 1,
          },
        },

        {
          $facet: {
            numbers: [
              { $skip: skip },
              { $limit: limit },
            ],

            totalCount: [
              {
                $count: 'total',
              },
            ],
          },
        },
      ],
      cursor: {},
    } as any);

    const batch = (result as any)?.cursor?.firstBatch?.[0];

    const numbers = batch?.numbers || [];
    const total = batch?.totalCount?.[0]?.total || 0;

    return {
      success: true,
      numbers: numbers.map((item: any) => ({
    id: item._id?.$oid || item._id?.toString(),
    title: item.title,
    phone: item.phone,
    createdAt: item.createdAt?.$date || item.createdAt,
    updatedAt: item.updatedAt?.$date || item.updatedAt,
    location: {
      latitude: item.location?.latitude,
      longitude: item.location?.longitude,
    },
    geolocation: {
      type: item.geolocation?.type,
      coordinates: item.geolocation?.coordinates,
    },
    distance: item.distance,
  })),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPreviousPage: page > 1,
      },
      radiusInMeters,
      userLocation: {
        latitude,
        longitude,
      },
    };
  } catch (error: any) {
    throw new InternalServerErrorException(
      `Failed to search nearby useful numbers: ${error.message}`,
    );
  }
}
}
