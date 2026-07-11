import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePresetMessageDto } from './dtos/create-preset-message.dto';
import { UpdatePresetMessageDto } from './dtos/update-preset-message.dto';

@Injectable()
export class PresetMessageService {
  constructor(private readonly prismaService: PrismaService) {}

  async createPresetMessage(createPresetMessageDto: CreatePresetMessageDto) {
    
    return this.prismaService.presetMessage.create({
      data: {
        message: createPresetMessageDto.message_en,
        message_it: createPresetMessageDto.message_it,
        type: createPresetMessageDto.type ?? 'CLASSIC',
        isActive: createPresetMessageDto.isActive ?? true,
      },
    });
  }

  async getAllPresetMessages(page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;

    const [messages, total] = await Promise.all([
      this.prismaService.presetMessage.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prismaService.presetMessage.count(),
    ]);

    return { messages, total, page, limit };
  }

  async getPresetMessageById(id: string) {
    const message = await this.prismaService.presetMessage.findUnique({
      where: { id },
    });

    if (!message) {
      throw new NotFoundException(`Preset message with ID ${id} not found`);
    }

    return message;
  }

  async updatePresetMessage(id: string, updatePresetMessageDto: UpdatePresetMessageDto) {
    const existingMessage = await this.prismaService.presetMessage.findUnique({
      where: { id },
    });

    if (!existingMessage) {
      throw new NotFoundException(`Preset message with ID ${id} not found`);
    }

    return this.prismaService.presetMessage.update({
      where: { id },
      data: {
        ...(updatePresetMessageDto.message_en !== undefined && { message: updatePresetMessageDto.message_en }),
        ...(updatePresetMessageDto.message_it !== undefined && { message_it: updatePresetMessageDto.message_it }),
        ...(updatePresetMessageDto.type !== undefined && { type: updatePresetMessageDto.type }),
        ...(updatePresetMessageDto.isActive !== undefined && { isActive: updatePresetMessageDto.isActive }),
      },
    });
  }

  async deletePresetMessage(id: string) {
    const existingMessage = await this.prismaService.presetMessage.findUnique({
      where: { id },
    });

    if (!existingMessage) {
      throw new NotFoundException(`Preset message with ID ${id} not found`);
    }

    await this.prismaService.presetMessage.delete({
      where: { id },
    });

    return { message: 'Preset message deleted successfully' };
  }
}
