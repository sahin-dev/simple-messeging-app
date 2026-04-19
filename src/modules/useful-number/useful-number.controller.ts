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
  ) {
    return this.usefulNumberService.getAllUsefulNumbers(page, limit);
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
}
