import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  UseGuards,
} from '@nestjs/common';
import { ParkingReportService } from './parking-report.service';
import { CreateParkingReportDto, UpdateParkingReportDto } from './dtos';
import { ResponseMessage } from 'src/common/decorators/apiResponseMessage.decorator';
import { GetUser } from 'src/common/decorators';

@Controller('parking-report')
export class ParkingReportController {
  constructor(private readonly parkingReportService: ParkingReportService) {}

  @Post()
  @HttpCode(201)
  @ResponseMessage('Parking report created successfully')
  async createParkingReport(
    @GetUser('id') userId: string,
    @Body() createParkingReportDto: CreateParkingReportDto,
  ) {
    return this.parkingReportService.createParkingReport(userId, createParkingReportDto);
  }

  @Get()
  @HttpCode(200)
  @ResponseMessage('Parking reports fetched successfully')
  async getAllParkingReports(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('isActive') isActive: boolean = true,
  ) {
    return this.parkingReportService.getAllParkingReports(page, limit, isActive);
  }

  @Get('nearby')
  @HttpCode(200)
  @ResponseMessage('Nearby parking reports fetched successfully')
  async getNearbyParkingReports(
    @Query('latitude') latitude: number,
    @Query('longitude') longitude: number,
    @Query('radius') radius: number = 5,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    return this.parkingReportService.getNearbyParkingReports(latitude, longitude, radius, page, limit);
  }

  @Get('user/:userId')
  @HttpCode(200)
  @ResponseMessage('User parking reports fetched successfully')
  async getParkingReportsByUserId(
    @Param('userId') userId: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    return this.parkingReportService.getParkingReportsByUserId(userId, page, limit);
  }

  @Get(':id')
  @HttpCode(200)
  @ResponseMessage('Parking report fetched successfully')
  async getParkingReportById(@Param('id') id: string) {
    return this.parkingReportService.getParkingReportById(id);
  }

  @Put(':id')
  @HttpCode(200)
  @ResponseMessage('Parking report updated successfully')
  async updateParkingReport(
    @Param('id') id: string,
    @GetUser('id') userId: string,
    @Body() updateParkingReportDto: UpdateParkingReportDto,
  ) {
    return this.parkingReportService.updateParkingReport(id, userId, updateParkingReportDto);
  }

  @Put(':id/deactivate')
  @HttpCode(200)
  @ResponseMessage('Parking report deactivated successfully')
  async deactivateParkingReport(
    @Param('id') id: string,
    @GetUser('id') userId: string,
  ) {
    return this.parkingReportService.deactivateParkingReport(id, userId);
  }

  @Delete(':id')
  @HttpCode(200)
  @ResponseMessage('Parking report deleted successfully')
  async deleteParkingReport(
    @Param('id') id: string,
    @GetUser('id') userId: string,
  ) {
    return this.parkingReportService.deleteParkingReport(id, userId);
  }
}
