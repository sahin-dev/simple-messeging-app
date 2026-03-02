import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { CreateUpdatePolicyDto } from "./dtos/create-update-policy.dto";
import { Roles } from "src/common/decorators/role.decorator";
import { UserRole } from "generated/prisma/enums";
import { PrivacyPolicyService } from "./privacypolicy.service";
import { GetSitePolicyDto } from "./dtos/get-site-policy.dto";
import { Public } from "src/common/decorators/public.decorator";
import { plainToInstance } from "class-transformer";
import { PolicyResponseDto } from "./dtos/policy-response.dto";
import { ResponseMessage } from "src/common/decorators/apiResponseMessage.decorator";

@Controller({
    path: "site-policy"
})
export class PrivacyPolicyController {

    constructor(private readonly privacyPolicyService: PrivacyPolicyService) { }

    @Roles(UserRole.ADMIN)
    @Post()
    @ResponseMessage("Policy created successfully")
    async createUpdatePolicy(@Body() createUpdatePolicyDto: CreateUpdatePolicyDto) {
        const updatedPolicy = await this.privacyPolicyService.updateCreatePolicy(createUpdatePolicyDto)

        return updatedPolicy
    }

    @Get(":type")
    @Public()
    @ResponseMessage("Policy fetched successfully")
    async getSitePolicy(@Param() getPolicyDto: GetSitePolicyDto) {
        const result = await this.privacyPolicyService.getSitePolicy(getPolicyDto.type)

        return plainToInstance(PolicyResponseDto, result, {
            excludeExtraneousValues: true
        })
    }

}