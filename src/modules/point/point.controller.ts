import { Controller, Post, Get, Put, Delete, Body, Param, Query, HttpCode } from '@nestjs/common';
import { PointService } from './point.service';
import { CreatePointDto } from './dtos/create-point.dto';
import { UpdatePointDto } from './dtos/update-point.dto';
import { ResponseMessage } from 'src/common/decorators/apiResponseMessage.decorator';

@Controller('point')
export class PointController {
  constructor(private readonly pointService: PointService) {}

  @Post()
  @HttpCode(201)
  @ResponseMessage('Point created successfully')
  async createPoint(@Body() createPointDto: CreatePointDto) {
    return this.pointService.createPoint(createPointDto);
  }

  @Get()
  @HttpCode(200)
  @ResponseMessage('Points fetched successfully')
  async getAllPoints(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    return this.pointService.getAllPoints(page, limit);
  }

  @Get('search/name')
  @HttpCode(200)
  @ResponseMessage('Points searched by name successfully')
  async searchPointsByName(
    @Query('query') query: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    return this.pointService.searchPointsByName(query, page, limit);
  }

  @Get('search/location')
  @HttpCode(200)
  @ResponseMessage('Points searched by location successfully')
  async searchPointsByLocation(
    @Query('latitude') latitude: number,
    @Query('longitude') longitude: number,
    @Query('radius') radiusKm: number = 10,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    return this.pointService.searchPointsByLocation(latitude, longitude, radiusKm, page, limit);
  }

  @Get(':id')
  @HttpCode(200)
  @ResponseMessage('Point fetched successfully')
  async getPointById(@Param('id') id: string) {
    return this.pointService.getPointById(id);
  }

  @Put(':id')
  @HttpCode(200)
  @ResponseMessage('Point updated successfully')
  async updatePoint(
    @Param('id') id: string,
    @Body() updatePointDto: UpdatePointDto,
  ) {
    return this.pointService.updatePoint(id, updatePointDto);
  }

  @Delete(':id')
  @HttpCode(200)
  @ResponseMessage('Point deleted successfully')
  async deletePoint(@Param('id') id: string) {
    return this.pointService.deletePoint(id);
  }
}
