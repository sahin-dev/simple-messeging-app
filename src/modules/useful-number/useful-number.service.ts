import { Injectable, NotFoundException } from '@nestjs/common';
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
      data.location = {
        latitude: updateUsefulNumberDto.latitude ?? existingNumber.location.latitude,
        longitude: updateUsefulNumberDto.longitude ?? existingNumber.location.longitude,
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
}
