import { Expose, Type } from "class-transformer";

export class FaqResponseDto {
    @Expose()
    id: string

    @Expose()
    title: string

    @Expose()
    description: string

    @Expose()
    createdAt: Date

    @Expose()
    updatedAt: Date
}

export class PaginatedFaqResponseDto {
    @Expose()
    @Type(() => FaqResponseDto)
    faqs: FaqResponseDto[]

    @Expose()
    totalFaqs: number

    @Expose()
    page: number

    @Expose()
    limit: number

    @Expose()
    totalPages: number
}
