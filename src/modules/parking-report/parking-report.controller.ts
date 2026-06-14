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
import { CreateParkingSpotDto } from './dtos/create-parking-spot.dto';

@Controller('parking-report')
export class ParkingReportController {
  constructor(private readonly parkingReportService: ParkingReportService) { }

  @Post()
  @HttpCode(201)
  @ResponseMessage('Parking report created successfully')
  async createParkingReport(
    @GetUser('id') userId: string,
    @Body() createParkingReportDto: CreateParkingReportDto,
  ) {
    return this.parkingReportService.createParkingReport(userId, createParkingReportDto);
  }

  // ---------- Parking Spot Endpoints ----------
  @Post('spot')
  @HttpCode(201)
  @ResponseMessage('Parking spot created successfully')
  async createParkingSpot(
    @GetUser('id') userId: string,
    @Body() createParkingSpotDto: CreateParkingSpotDto,
  ) {
    return this.parkingReportService.createParkingSpot(userId, createParkingSpotDto);
  }

  @Get('spot')
  @HttpCode(200)
  @ResponseMessage('Parking spots fetched successfully')
  async getAllParkingSpots(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    return this.parkingReportService.getAllParkingSpots(page, limit);
  }

  @Get('spot/:id')
  @HttpCode(200)
  @ResponseMessage('Parking spot fetched successfully')
  async getParkingSpotById(@Param('id') id: string) {
    return this.parkingReportService.getParkingSpotById(id);
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

  @Get('credit/status')
  @HttpCode(200)
  @ResponseMessage('User parking notification credits fetched successfully')
  async getUserParkingCredits(@GetUser('id') userId: string) {
    return this.parkingReportService.getUserParkingCredits(userId);
  }

  @Get('credit/history')
  @HttpCode(200)
  @ResponseMessage('User parking notification credit history fetched successfully')
  async getUserParkingCreditHistory(
    @GetUser('id') userId: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    return this.parkingReportService.getUserParkingCreditHistory(userId, page, limit);
  }
}

