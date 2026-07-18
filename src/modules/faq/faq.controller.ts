import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { ResponseMessage } from "src/common/decorators/apiResponseMessage.decorator";
import { Public } from "src/common/decorators/public.decorator";
import { Roles } from "src/common/decorators/role.decorator";
import { PaginationDto } from "src/common/dtos/pagination.dto";
import { UserRole } from "generated/prisma/enums";
import { CreateFaqDto } from "./dtos/create-faq.dto";
import { FaqResponseDto, PaginatedFaqResponseDto } from "./dtos/faq-response.dto";
import { UpdateFaqDto } from "./dtos/update-faq.dto";
import { FaqService } from "./faq.service";

@Controller({
    path: "faqs",
})
export class FaqController {

    constructor(private readonly faqService: FaqService) { }

    @Post()
    @Roles(UserRole.ADMIN)
    @ResponseMessage("Faq created successfully")
    async createFaq(@Body() createFaqDto: CreateFaqDto) {
        const faq = await this.faqService.createFaq(createFaqDto);

        return plainToInstance(FaqResponseDto, faq, {
            excludeExtraneousValues: true,
        });
    }

    @Get()
    @Public()
    @ResponseMessage("Faqs fetched successfully")
    async getFaqs(@Query() paginationDto: PaginationDto) {
        const result = await this.faqService.getFaqs(paginationDto);

        return plainToInstance(PaginatedFaqResponseDto, result, {
            excludeExtraneousValues: true,
        });
    }

    @Get(":id")
    @Public()
    @ResponseMessage("Faq fetched successfully")
    async getFaqById(@Param("id") faqId: string) {
        const faq = await this.faqService.getFaqById(faqId);

        return plainToInstance(FaqResponseDto, faq, {
            excludeExtraneousValues: true,
        });
    }

    @Patch(":id")
    @Roles(UserRole.ADMIN)
    @ResponseMessage("Faq updated successfully")
    async updateFaq(
        @Param("id") faqId: string,
        @Body() updateFaqDto: UpdateFaqDto
    ) {
        const faq = await this.faqService.updateFaq(faqId, updateFaqDto);

        return plainToInstance(FaqResponseDto, faq, {
            excludeExtraneousValues: true,
        });
    }

    @Delete(":id")
    @Roles(UserRole.ADMIN)
    @ResponseMessage("Faq deleted successfully")
    async deleteFaq(@Param("id") faqId: string) {
        return this.faqService.deleteFaq(faqId);
    }
}
