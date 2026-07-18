import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { PaginationDto } from "src/common/dtos/pagination.dto";
import { CreateFaqDto } from "./dtos/create-faq.dto";
import { UpdateFaqDto } from "./dtos/update-faq.dto";

@Injectable()
export class FaqService {

    constructor(private readonly prismaService: PrismaService) { }

    async createFaq(createFaqDto: CreateFaqDto) {
        const title = createFaqDto.title.trim();
        const description = createFaqDto.description.trim();

        if (!title) {
            throw new BadRequestException("Faq title cannot be empty");
        }

        if (!description) {
            throw new BadRequestException("Faq description cannot be empty");
        }

        return this.prismaService.faq.create({
            data: {
                title,
                description,
            },
        });
    }

    async getFaqs(paginationDto: PaginationDto) {
        const page = paginationDto.page || 1;
        const limit = paginationDto.limit || 20;
        const skip = (page - 1) * limit;

        const [totalFaqs, faqs] = await Promise.all([
            this.prismaService.faq.count(),
            this.prismaService.faq.findMany({
                skip,
                take: limit,
                orderBy: { createdAt: "desc" },
            }),
        ]);

        return {
            faqs,
            totalFaqs,
            page,
            limit,
            totalPages: Math.ceil(totalFaqs / limit),
        };
    }

    async getFaqById(faqId: string) {
        const faq = await this.prismaService.faq.findUnique({
            where: { id: faqId },
        });

        if (!faq) {
            throw new NotFoundException("Faq not found");
        }

        return faq;
    }

    async updateFaq(faqId: string, updateFaqDto: UpdateFaqDto) {
        const existingFaq = await this.getFaqById(faqId);
        const updateData: UpdateFaqDto = {};

        if (updateFaqDto.title !== undefined) {
            const title = updateFaqDto.title.trim();
            if (!title) {
                throw new BadRequestException("Faq title cannot be empty");
            }
            updateData.title = title;
        }

        if (updateFaqDto.description !== undefined) {
            const description = updateFaqDto.description.trim();
            if (!description) {
                throw new BadRequestException("Faq description cannot be empty");
            }
            updateData.description = description;
        }

        if (Object.keys(updateData).length === 0) {
            return existingFaq;
        }

        return this.prismaService.faq.update({
            where: { id: faqId },
            data: updateData,
        });
    }

    async deleteFaq(faqId: string) {
        await this.getFaqById(faqId);

        await this.prismaService.faq.delete({
            where: { id: faqId },
        });

        return { message: "Faq deleted successfully" };
    }
}
