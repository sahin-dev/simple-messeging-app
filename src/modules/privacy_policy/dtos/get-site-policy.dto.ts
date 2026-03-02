import { IsEnum, IsIn, IsNotEmpty, IsString } from "class-validator";
import { PolicyType } from "generated/prisma/enums";

export class GetSitePolicyDto {

    @IsEnum(PolicyType)
    @IsString()
    @IsNotEmpty()
    type:PolicyType
}