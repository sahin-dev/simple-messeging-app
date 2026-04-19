import { Controller, Post, Get, Put, Delete, Body, Param, Query, HttpCode } from '@nestjs/common';
import { PresetMessageService } from './preset-message.service';
import { CreatePresetMessageDto } from './dtos/create-preset-message.dto';
import { UpdatePresetMessageDto } from './dtos/update-preset-message.dto';
import { ResponseMessage } from 'src/common/decorators/apiResponseMessage.decorator';

@Controller('preset-message')
export class PresetMessageController {
  constructor(private readonly presetMessageService: PresetMessageService) {}

  @Post()
  @HttpCode(201)
  @ResponseMessage('Preset message created successfully')
  async createPresetMessage(@Body() createPresetMessageDto: CreatePresetMessageDto) {
    return this.presetMessageService.createPresetMessage(createPresetMessageDto);
  }

  @Get()
  @HttpCode(200)
  @ResponseMessage('Preset messages fetched successfully')
  async getAllPresetMessages(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    return this.presetMessageService.getAllPresetMessages(page, limit);
  }

  @Get(':id')
  @HttpCode(200)
  @ResponseMessage('Preset message fetched successfully')
  async getPresetMessageById(@Param('id') id: string) {
    return this.presetMessageService.getPresetMessageById(id);
  }

  @Put(':id')
  @HttpCode(200)
  @ResponseMessage('Preset message updated successfully')
  async updatePresetMessage(
    @Param('id') id: string,
    @Body() updatePresetMessageDto: UpdatePresetMessageDto,
  ) {
    return this.presetMessageService.updatePresetMessage(id, updatePresetMessageDto);
  }

  @Delete(':id')
  @HttpCode(200)
  @ResponseMessage('Preset message deleted successfully')
  async deletePresetMessage(@Param('id') id: string) {
    return this.presetMessageService.deletePresetMessage(id);
  }
}
