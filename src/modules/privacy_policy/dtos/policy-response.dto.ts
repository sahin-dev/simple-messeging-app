import { Expose } from "class-transformer";

export class PolicyResponseDto {

    @Expose()
    content:string

    @Expose()
    updatedAt:string
}