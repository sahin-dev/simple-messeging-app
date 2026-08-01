import { Controller, Post, Get, Put, Delete, Body, Param, Query, HttpCode } from '@nestjs/common';
import { UsefulNumberService } from './useful-number.service';
import { CreateUsefulNumberDto } from './dtos/create-useful-number.dto';
import { UpdateUsefulNumberDto } from './dtos/update-useful-number.dto';
import { ResponseMessage } from 'src/common/decorators/apiResponseMessage.decorator';

@Controller('useful-number')
export class UsefulNumberController {
  constructor(private readonly usefulNumberService: UsefulNumberService) {}

  @Post()
  @HttpCode(201)
  @ResponseMessage('Useful number created successfully')
  async createUsefulNumber(@Body() createUsefulNumberDto: CreateUsefulNumberDto) {
    return this.usefulNumberService.createUsefulNumber(createUsefulNumberDto);
  }

  @Get()
  @HttpCode(200)
  @ResponseMessage('Useful numbers fetched successfully')
  async getAllUsefulNumbers(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('isActive') isActive?: string,
    @Query('category') category?: string,
  ) {
    return this.usefulNumberService.getAllUsefulNumbers(
      Number(page),
      Number(limit),
      this.parseBooleanQuery(isActive),
      category,
    );
  }

  @Get('grouped')
  @HttpCode(200)
  @ResponseMessage('Grouped useful numbers fetched successfully')
  async getGroupedUsefulNumbers(@Query('isActive') isActive?: string) {
    return this.usefulNumberService.getGroupedUsefulNumbers(
      this.parseBooleanQuery(isActive) ?? true,
    );
  }

  @Get('search')
  @HttpCode(200)
  @ResponseMessage('Useful numbers searched successfully')
  async searchUsefulNumbers(
    @Query('query') query: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    return this.usefulNumberService.searchUsefulNumbers(query, page, limit);
  }

  @Get('nearby')
  @HttpCode(200)
  @ResponseMessage('Nearby useful numbers fetched successfully')
  async searchNearbyUsefulNumbers(
    @Query('latitude') latitude: number,
    @Query('longitude') longitude: number,
    @Query('radiusInMeters') radiusInMeters: number = 10000,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    return this.usefulNumberService.searchNearbyUsefulNumbers(
      parseFloat(latitude.toString()),
      parseFloat(longitude.toString()),
      parseFloat(radiusInMeters.toString()),
      page,
      limit,
    );
  }

  @Get(':id')
  @HttpCode(200)
  @ResponseMessage('Useful number fetched successfully')
  async getUsefulNumberById(@Param('id') id: string) {
    return this.usefulNumberService.getUsefulNumberById(id);
  }

  @Put(':id')
  @HttpCode(200)
  @ResponseMessage('Useful number updated successfully')
  async updateUsefulNumber(
    @Param('id') id: string,
    @Body() updateUsefulNumberDto: UpdateUsefulNumberDto,
  ) {
    return this.usefulNumberService.updateUsefulNumber(id, updateUsefulNumberDto);
  }

  @Delete(':id')
  @HttpCode(200)
  @ResponseMessage('Useful number deleted successfully')
  async deleteUsefulNumber(@Param('id') id: string) {
    return this.usefulNumberService.deleteUsefulNumber(id);
  }

  private parseBooleanQuery(value?: string) {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }

    if (value === 'true') {
      return true;
    }

    if (value === 'false') {
      return false;
    }

    return undefined;
  }
}
