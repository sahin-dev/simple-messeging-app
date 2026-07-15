import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { GetUser } from 'src/common/decorators';
import { Roles } from 'src/common/decorators/role.decorator';
import { ResponseMessage } from 'src/common/decorators/apiResponseMessage.decorator';
import { UserRole } from 'generated/prisma/enums';
import { ParkRelayService } from './park-relay.service';
import {
  CreateParkingAreaDto,
  CreateParkingHandoffDto,
  CreateParkingSessionDto,
  SaveParkingLocationDto,
  SearchParkingAreaDto,
  SubmitParkingAreaPointDto,
  UpdateParkingAreaDto,
  UpdateParkingModeDto,
} from './dtos/park-relay.dto';

@Controller('park-relay')
export class ParkRelayController {
  constructor(private readonly parkRelayService: ParkRelayService) {}

  @Post('parking-mode/searching')
  @HttpCode(200)
  @ResponseMessage('Parking search mode started successfully')
  async startSearching(
    @GetUser('id') userId: string,
    @Body() dto: UpdateParkingModeDto,
  ) {
    return this.parkRelayService.startSearching(userId, dto);
  }

  @Post('parking-mode/parked')
  @HttpCode(200)
  @ResponseMessage('Parking mode updated to parked successfully')
  async markParked(
    @GetUser('id') userId: string,
    @Body() dto: UpdateParkingModeDto,
  ) {
    return this.parkRelayService.markParked(userId, dto);
  }

  @Post('parking-mode/idle')
  @HttpCode(200)
  @ResponseMessage('Parking mode updated to idle successfully')
  async setIdle(@GetUser('id') userId: string) {
    return this.parkRelayService.setIdle(userId);
  }

  @Get('parking-mode/me')
  @HttpCode(200)
  @ResponseMessage('Parking mode fetched successfully')
  async getMyParkingMode(@GetUser('id') userId: string) {
    return this.parkRelayService.getMyParkingMode(userId);
  }

  @Post('handoffs')
  @HttpCode(201)
  @ResponseMessage('Parking handoff created successfully')
  async createHandoff(
    @GetUser('id') userId: string,
    @Body() dto: CreateParkingHandoffDto,
  ) {
    return this.parkRelayService.createHandoff(userId, dto);
  }

  @Post('handoffs/:id/accept')
  @HttpCode(200)
  @ResponseMessage('Parking handoff accepted successfully')
  async acceptHandoff(
    @GetUser('id') userId: string,
    @Param('id') handoffId: string,
  ) {
    return this.parkRelayService.acceptHandoff(userId, handoffId);
  }

  @Post('handoffs/:id/cancel')
  @HttpCode(200)
  @ResponseMessage('Parking handoff cancelled successfully')
  async cancelHandoff(
    @GetUser('id') userId: string,
    @Param('id') handoffId: string,
  ) {
    return this.parkRelayService.cancelHandoff(userId, handoffId);
  }

  @Post('handoffs/:id/occupied')
  @HttpCode(200)
  @ResponseMessage('Parking handoff marked occupied successfully')
  async markHandoffOccupied(
    @GetUser('id') userId: string,
    @Param('id') handoffId: string,
  ) {
    return this.parkRelayService.markHandoffOccupied(userId, handoffId);
  }

  @Get('handoffs/nearby')
  @HttpCode(200)
  @ResponseMessage('Nearby parking handoffs fetched successfully')
  async getNearbyHandoffs(
    @Query('latitude') latitude: number,
    @Query('longitude') longitude: number,
    @Query('radiusMeters') radiusMeters?: number,
  ) {
    return this.parkRelayService.getNearbyHandoffs(
      Number(latitude),
      Number(longitude),
      radiusMeters ? Number(radiusMeters) : undefined,
    );
  }

  @Get('handoffs/:id')
  @HttpCode(200)
  @ResponseMessage('Parking handoff fetched successfully')
  async getHandoffById(@Param('id') handoffId: string) {
    return this.parkRelayService.getHandoffById(handoffId);
  }

  @Post('saved-parking')
  @HttpCode(200)
  @ResponseMessage('Parking location saved successfully')
  async saveParkingLocation(
    @GetUser('id') userId: string,
    @Body() dto: SaveParkingLocationDto,
  ) {
    return this.parkRelayService.saveParkingLocation(userId, dto);
  }

  @Get('saved-parking/me')
  @HttpCode(200)
  @ResponseMessage('Saved parking location fetched successfully')
  async getSavedParkingLocation(@GetUser('id') userId: string) {
    return this.parkRelayService.getSavedParkingLocation(userId);
  }

  @Get('admin/saved-parking')
  @HttpCode(200)
  @Roles(UserRole.ADMIN)
  @ResponseMessage('Saved parking locations fetched successfully')
  async getAllSavedParkingLocations(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ) {
    return this.parkRelayService.getAllSavedParkingLocations(page, limit);
  }

  @Delete('saved-parking/me')
  @HttpCode(200)
  @ResponseMessage('Saved parking location deleted successfully')
  async deleteSavedParkingLocation(@GetUser('id') userId: string) {
    return this.parkRelayService.deleteSavedParkingLocation(userId);
  }

  @Post('parking-sessions')
  @HttpCode(201)
  @ResponseMessage('Parking session created successfully')
  async createParkingSession(
    @GetUser('id') userId: string,
    @Body() dto: CreateParkingSessionDto,
  ) {
    return this.parkRelayService.createParkingSession(userId, dto);
  }

  @Get('parking-sessions/me/active')
  @HttpCode(200)
  @ResponseMessage('Active parking session fetched successfully')
  async getActiveParkingSession(@GetUser('id') userId: string) {
    return this.parkRelayService.getActiveParkingSession(userId);
  }

  @Post('parking-sessions/:id/leave')
  @HttpCode(200)
  @ResponseMessage('Parking session left successfully')
  async leaveParkingSession(
    @GetUser('id') userId: string,
    @Param('id') sessionId: string,
  ) {
    return this.parkRelayService.leaveParkingSession(userId, sessionId);
  }

  @Post('parking-sessions/dispatch-expiry-warnings')
  @HttpCode(200)
  @Roles(UserRole.ADMIN)
  @ResponseMessage('Parking expiry warnings dispatched successfully')
  async dispatchParkingExpiryWarnings() {
    return this.parkRelayService.dispatchParkingExpiryWarnings();
  }

  @Get('parking-areas/nearby')
  @HttpCode(200)
  @ResponseMessage('Nearby parking areas fetched successfully')
  async getNearbyParkingAreas(
    @Query('latitude') latitude: number,
    @Query('longitude') longitude: number,
    @Query('radiusMeters') radiusMeters?: number,
  ) {
    return this.parkRelayService.getNearbyParkingAreas(
      Number(latitude),
      Number(longitude),
      radiusMeters ? Number(radiusMeters) : undefined,
    );
  }

  @Get('parking-areas/search')
  @HttpCode(200)
  @ResponseMessage('Parking areas searched successfully')
  async searchParkingAreas(@Query() query: SearchParkingAreaDto) {
    return this.parkRelayService.searchParkingAreas(query);
  }

  @Post('parking-areas')
  @HttpCode(201)
  @ResponseMessage('Parking area submitted successfully')
  async submitParkingAreaPoint(
    @GetUser('id') userId: string,
    @Body() dto: SubmitParkingAreaPointDto,
  ) {
    return this.parkRelayService.submitParkingAreaPoint(userId, dto);
  }

  @Post('admin/parking-areas')
  @HttpCode(201)
  @Roles(UserRole.ADMIN)
  @ResponseMessage('Parking area created successfully')
  async createParkingArea(
    @GetUser('id') adminId: string,
    @Body() dto: CreateParkingAreaDto,
  ) {
    return this.parkRelayService.createParkingArea(adminId, dto);
  }

  @Get('admin/parking-areas')
  @HttpCode(200)
  @Roles(UserRole.ADMIN)
  @ResponseMessage('Parking areas fetched successfully')
  async getParkingAreas(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ) {
    return this.parkRelayService.getParkingAreas(page, limit);
  }

  @Patch('admin/parking-areas/:id')
  @HttpCode(200)
  @Roles(UserRole.ADMIN)
  @ResponseMessage('Parking area updated successfully')
  async updateParkingArea(
    @Param('id') areaId: string,
    @Body() dto: UpdateParkingAreaDto,
  ) {
    return this.parkRelayService.updateParkingArea(areaId, dto);
  }

  @Delete('admin/parking-areas/:id')
  @HttpCode(200)
  @Roles(UserRole.ADMIN)
  @ResponseMessage('Parking area deleted successfully')
  async deleteParkingArea(@Param('id') areaId: string) {
    return this.parkRelayService.deleteParkingArea(areaId);
  }
}
