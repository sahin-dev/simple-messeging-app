import { Transform } from "class-transformer";
import { IsNotEmpty, IsString } from "class-validator";

export class VerifyLicenseDto {
    @IsNotEmpty()
    @IsString()
    @Transform(({ value }) => value.trim())
    readonly plate_no: string;
}
