import { IsMongoId, IsNotEmpty, IsNumber, IsString, Max, Min } from "class-validator"

export class CreateRatingDto {

    @IsString()
    @IsMongoId()
    @IsNotEmpty()
    rater_id:string

    @IsString()
    @IsMongoId()
    @IsNotEmpty()
    ratee_id:string

    @IsNumber()
    @IsNotEmpty()
    @Min(1)
    @Max(5)
    rating:number
}