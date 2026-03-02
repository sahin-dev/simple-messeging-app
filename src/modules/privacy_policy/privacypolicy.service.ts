import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { PolicyType } from "generated/prisma/enums";
import { CreateUpdatePolicyDto } from "./dtos/create-update-policy.dto";

@Injectable()
export class PrivacyPolicyService {

    constructor(private readonly prismaService: PrismaService) { }

    async updateCreatePolicy(createUpdatePolicyDto: CreateUpdatePolicyDto) {

        const existingPolicy = await this.prismaService.sitePolicy.findFirst({ where: { type: createUpdatePolicyDto.type } })

        if (existingPolicy) {
            return await this.prismaService.sitePolicy.update({ where: { id: existingPolicy.id }, data: { content: createUpdatePolicyDto.content } })
        }
        return await this.prismaService.sitePolicy.create({ data: { type: createUpdatePolicyDto.type, content: createUpdatePolicyDto.content } })
    }

    async getSitePolicy(type: PolicyType) {
        const policy = await this.prismaService.sitePolicy.findFirst({ where: { type } })

        if (policy) {
            return policy
        }

        throw new NotFoundException(`${type} not found!`)
    }

}