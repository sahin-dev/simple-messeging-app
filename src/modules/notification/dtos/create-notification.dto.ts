import { IsEnum, IsMongoId, IsNotEmpty, IsString } from "class-validator"


export class CreateNotificationDto {

    @IsString()
    @IsMongoId()
    @IsNotEmpty()
    userId:string

    @IsString()
    @IsNotEmpty()
    title:string

    @IsString()
    @IsNotEmpty()
    message:string



}