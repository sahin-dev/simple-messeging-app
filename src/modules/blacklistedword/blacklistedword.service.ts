import { Injectable, BadRequestException, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateBlacklistedwordDto } from "./dtos/create-blacklistedword.dto";
import { UpdateBlacklistedwordDto } from "./dtos/update-blacklistedword.dto";
import { PaginationDto } from "src/common/dtos/pagination.dto";

@Injectable()
export class BlacklistedwordService {

    constructor(
        private readonly prismaService: PrismaService,
    ) { }

    /**
     * Add a new blacklisted word
     * @param createBlacklistedwordDto 
     * @returns 
     */
    async addBlacklistedWord(createBlacklistedwordDto: CreateBlacklistedwordDto) {
        const existingWord = await this.prismaService.blackListedWord.findUnique({
            where: { word: createBlacklistedwordDto.word.toLowerCase() }
        });

        if (existingWord) {
            throw new BadRequestException('This word is already blacklisted');
        }

        const blacklistedWord = await this.prismaService.blackListedWord.create({
            data: {
                word: createBlacklistedwordDto.word.toLowerCase()
            }
        });

        return blacklistedWord;
    }

    /**
     * Update a blacklisted word
     * @param wordId 
     * @param updateBlacklistedwordDto 
     * @returns 
     */
    async updateBlacklistedWord(wordId: string, updateBlacklistedwordDto: UpdateBlacklistedwordDto) {
        const existingWord = await this.prismaService.blackListedWord.findUnique({
            where: { id: wordId }
        });

        if (!existingWord) {
            throw new NotFoundException('Blacklisted word not found');
        }

        // Check if new word already exists
        if (updateBlacklistedwordDto.word && updateBlacklistedwordDto.word.toLowerCase() !== existingWord.word) {
            const wordExists = await this.prismaService.blackListedWord.findUnique({
                where: { word: updateBlacklistedwordDto.word.toLowerCase() }
            });

            if (wordExists) {
                throw new BadRequestException('This word is already blacklisted');
            }
        }

        const updatedWord = await this.prismaService.blackListedWord.update({
            where: { id: wordId },
            data: {
                word: updateBlacklistedwordDto.word.toLowerCase()
            }
        });

        return updatedWord;
    }

    /**
     * Get all blacklisted words with pagination
     * @param paginationDto 
     * @returns 
     */
    async getBlacklistedWords(paginationDto: PaginationDto) {
        const page = paginationDto.page || 1;
        const limit = paginationDto.limit || 10;
        const skip = (page - 1) * limit;

        const totalWords = await this.prismaService.blackListedWord.count();
        const words = await this.prismaService.blackListedWord.findMany({
            skip,
            take: limit,
            orderBy: { createdAt: 'desc' }
        });

        return {
            words,
            totalWords,
            page,
            limit,
            totalPages: Math.ceil(totalWords / limit)
        };
    }

    /**
     * Get a single blacklisted word by ID
     * @param wordId 
     * @returns 
     */
    async getBlacklistedWordById(wordId: string) {
        const word = await this.prismaService.blackListedWord.findUnique({
            where: { id: wordId }
        });

        if (!word) {
            throw new NotFoundException('Blacklisted word not found');
        }

        return word;
    }

    /**
     * Delete a blacklisted word
     * @param wordId 
     * @returns 
     */
    async deleteBlacklistedWord(wordId: string) {
        const existingWord = await this.prismaService.blackListedWord.findUnique({
            where: { id: wordId }
        });

        if (!existingWord) {
            throw new NotFoundException('Blacklisted word not found');
        }

        await this.prismaService.blackListedWord.delete({
            where: { id: wordId }
        });

        return { message: 'Blacklisted word deleted successfully' };
    }

    /**
     * Get all blacklisted words as an array
     * @returns 
     */
    async getAllBlacklistedWordsAsArray() {
        const words = await this.prismaService.blackListedWord.findMany({
            orderBy: { createdAt: 'desc' }
        });

        return words.map(item => item.word);
    }

    /**
     * Check if a word is blacklisted
     * @param word 
     * @returns 
     */
    async isWordBlacklisted(word: string): Promise<boolean> {
        const blacklistedWord = await this.prismaService.blackListedWord.findUnique({
            where: { word: word.toLowerCase() }
        });

        return !!blacklistedWord;
    }
}
