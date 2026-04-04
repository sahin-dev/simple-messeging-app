import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from "@nestjs/common";
import { BlacklistedwordService } from "./blacklistedword.service";
import { CreateBlacklistedwordDto } from "./dtos/create-blacklistedword.dto";
import { UpdateBlacklistedwordDto } from "./dtos/update-blacklistedword.dto";
import { PaginationDto } from "src/common/dtos/pagination.dto";
import { ResponseMessage } from "src/common/decorators/apiResponseMessage.decorator";
import { Roles } from "src/common/decorators/role.decorator";
import { RolesGuard } from "src/common/guards/roles.guards";
import { UserRole } from "generated/prisma/enums";

@Controller({
    path: "blacklisted-words",
})
@UseGuards(RolesGuard)
export class BlacklistedwordController {

    constructor(private readonly blacklistedwordService: BlacklistedwordService) { }

    /**
     * Add a new blacklisted word (Admin only)
     */
    @Post("add")
    @Roles(UserRole.ADMIN)
    @ResponseMessage("Blacklisted word added successfully")
    async addBlacklistedWord(@Body() createBlacklistedwordDto: CreateBlacklistedwordDto) {
        return await this.blacklistedwordService.addBlacklistedWord(createBlacklistedwordDto);
    }

    /**
     * Update a blacklisted word (Admin only)
     */
    @Put("update/:id")
    @Roles(UserRole.ADMIN)
    @ResponseMessage("Blacklisted word updated successfully")
    async updateBlacklistedWord(
        @Param('id') wordId: string,
        @Body() updateBlacklistedwordDto: UpdateBlacklistedwordDto
    ) {
        return await this.blacklistedwordService.updateBlacklistedWord(wordId, updateBlacklistedwordDto);
    }

    /**
     * Get all blacklisted words with pagination
     */
    @Get("list")
    @ResponseMessage("Blacklisted words fetched successfully")
    async getBlacklistedWords(@Query() paginationDto: PaginationDto) {
        return await this.blacklistedwordService.getBlacklistedWords(paginationDto);
    }

    /**
     * Get all blacklisted words as an array
     */
    @Get("all/words")
    @ResponseMessage("All blacklisted words fetched successfully")
    async getAllBlacklistedWordsAsArray() {
        return await this.blacklistedwordService.getAllBlacklistedWordsAsArray();
    }

    /**
     * Get a single blacklisted word by ID
     */
    @Get(":id")
    @ResponseMessage("Blacklisted word fetched successfully")
    async getBlacklistedWordById(@Param('id') wordId: string) {
        return await this.blacklistedwordService.getBlacklistedWordById(wordId);
    }

    /**
     * Delete a blacklisted word (Admin only)
     */
    @Delete(":id")
    @Roles(UserRole.ADMIN)
    @ResponseMessage("Blacklisted word deleted successfully")
    async deleteBlacklistedWord(@Param('id') wordId: string) {
        return await this.blacklistedwordService.deleteBlacklistedWord(wordId);
    }
}
