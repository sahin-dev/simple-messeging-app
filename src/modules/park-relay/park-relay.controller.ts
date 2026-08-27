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
  AcceptHandoffAndParkDto,
  AnswerPaidParkingPromptDto,
  CreateParkingAreaDto,
  CreateParkingAreaRatingDto,
  CreateParkingHandoffDto,
  CreateParkingSessionDto,
  ParkedEventDto,
  SaveParkingLocationDto,
  SearchParkingAreaDto,
  SubmitParkingAreaPointDto,
  UpdateParkingAreaDto,
  UpdateParkingAreaRatingDto,
  UpdateParkingModeDto,
  ViewportParkingAreaDto,
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

  @Post('handoffs/:id/accept-and-park')
  @HttpCode(200)
  @ResponseMessage('Parking handoff accepted and parking location saved successfully')
  async acceptHandoffAndPark(
    @GetUser('id') userId: string,
    @Param('id') handoffId: string,
    @Body() dto: AcceptHandoffAndParkDto,
  ) {
    return this.parkRelayService.acceptHandoffAndPark(userId, handoffId, dto);
  }

  @Post('handoffs/:id/found')
  @HttpCode(200)
  @ResponseMessage('Parking handoff marked found successfully')
  async markHandoffFound(
    @GetUser('id') userId: string,
    @Param('id') handoffId: string,
  ) {
    return this.parkRelayService.markHandoffFound(userId, handoffId);
  }

  @Get('handoffs/nearby')
  @HttpCode(200)
  @ResponseMessage('Nearby parking handoffs fetched successfully')
  async getNearbyHandoffs(
    @GetUser('id') userId: string,
    @Query('latitude') latitude: number,
    @Query('longitude') longitude: number,
    @Query('radiusMeters') radiusMeters?: number,
  ) {
    return this.parkRelayService.getNearbyHandoffs(
      userId,
      Number(latitude),
      Number(longitude),
      radiusMeters ? Number(radiusMeters) : undefined,
    );
  }

  @Get('handoffs/:id')
  @HttpCode(200)
  @ResponseMessage('Parking handoff fetched successfully')
  async getHandoffById(
    @GetUser('id') userId: string,
    @Param('id') handoffId: string,
    @Query('latitude') latitude?: number,
    @Query('longitude') longitude?: number,
  ) {
    return this.parkRelayService.getHandoffById(
      handoffId,
      userId,
      latitude !== undefined ? Number(latitude) : undefined,
      longitude !== undefined ? Number(longitude) : undefined,
    );
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

  @Post('parked-event')
  @HttpCode(200)
  @ResponseMessage('Parked event processed successfully')
  async processParkedEvent(
    @GetUser('id') userId: string,
    @Body() dto: ParkedEventDto,
  ) {
    return this.parkRelayService.processParkedEvent(userId, dto);
  }

  @Get('saved-parking/me')
  @HttpCode(200)
  @ResponseMessage('Saved parking location fetched successfully')
  async getSavedParkingLocation(@GetUser('id') userId: string) {
    return this.parkRelayService.getSavedParkingLocation(userId);
  }

  @Get('saved-parking/history')
  @HttpCode(200)
  @ResponseMessage('Saved parking history fetched successfully')
  async getSavedParkingHistory(
    @GetUser('id') userId: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ) {
    return this.parkRelayService.getSavedParkingHistory(userId, page, limit);
  }

  @Get('paid-parking-prompt/me')
  @HttpCode(200)
  @ResponseMessage('Pending paid parking prompt fetched successfully')
  async getPendingPaidParkingPrompt(@GetUser('id') userId: string) {
    return this.parkRelayService.getPendingPaidParkingPrompt(userId);
  }

  @Post('paid-parking-prompt/:id/answer')
  @HttpCode(200)
  @ResponseMessage('Paid parking prompt answered successfully')
  async answerPaidParkingPrompt(
    @GetUser('id') userId: string,
    @Param('id') promptId: string,
    @Body() dto: AnswerPaidParkingPromptDto,
  ) {
    return this.parkRelayService.answerPaidParkingPrompt(userId, promptId, dto);
  }

  @Post('paid-parking-prompt/:id/dismiss')
  @HttpCode(200)
  @ResponseMessage('Paid parking prompt dismissed successfully')
  async dismissPaidParkingPrompt(
    @GetUser('id') userId: string,
    @Param('id') promptId: string,
  ) {
    return this.parkRelayService.dismissPaidParkingPrompt(userId, promptId);
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

  @Get('parking-areas/viewport')
  @HttpCode(200)
  @ResponseMessage('Parking areas in map viewport fetched successfully')
  async getParkingAreasInViewport(@Query() query: ViewportParkingAreaDto) {
    return this.parkRelayService.getParkingAreasInViewport(query);
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
    @Query('isActive') isActive?: string,
  ) {
    const parsedIsActive = isActive === undefined ? undefined : isActive === 'true';
    return this.parkRelayService.getParkingAreas(page, limit, parsedIsActive);
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

  @Post('parking-areas/:id/ratings')
  @HttpCode(201)
  @ResponseMessage('Parking area rating created successfully')
  async createParkingAreaRating(
    @GetUser('id') userId: string,
    @Param('id') areaId: string,
    @Body() dto: CreateParkingAreaRatingDto,
  ) {
    return this.parkRelayService.createParkingAreaRating(userId, areaId, dto);
  }

  @Patch('parking-areas/:id/ratings/me')
  @HttpCode(200)
  @ResponseMessage('Parking area rating updated successfully')
  async updateMyParkingAreaRating(
    @GetUser('id') userId: string,
    @Param('id') areaId: string,
    @Body() dto: UpdateParkingAreaRatingDto,
  ) {
    return this.parkRelayService.updateMyParkingAreaRating(userId, areaId, dto);
  }

  @Get('parking-areas/:id/ratings/me')
  @HttpCode(200)
  @ResponseMessage('My parking area rating fetched successfully')
  async getMyParkingAreaRating(
    @GetUser('id') userId: string,
    @Param('id') areaId: string,
  ) {
    return this.parkRelayService.getMyParkingAreaRating(userId, areaId);
  }

  @Get('parking-areas/:id/ratings')
  @HttpCode(200)
  @ResponseMessage('Parking area ratings fetched successfully')
  async getParkingAreaRatings(
    @Param('id') areaId: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    return this.parkRelayService.getParkingAreaRatings(areaId, page, limit);
  }

  @Get('parking-areas/:id/rating-summary')
  @HttpCode(200)
  @ResponseMessage('Parking area rating summary fetched successfully')
  async getParkingAreaRatingSummary(@Param('id') areaId: string) {
    return this.parkRelayService.getParkingAreaRatingSummary(areaId);
  }
}
