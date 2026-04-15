import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { CreateRatingDto } from "./dtos/create-rating.dto";
import { UpdateRatingStatusDto } from "./dtos/update-rating-status.dto";

@Controller("ratings")
export class RatingController {

    constructor(){

    }

    @Post()
    async createRating (@Body() createratingDto:CreateRatingDto){

    }

    @Patch(":id/status")
    async updateRatingStatus(@Body() updateRatingStatusDto:UpdateRatingStatusDto){

    }

    @Get(":userId")
    async getRatingsForUser(@Param() userId:string){

    }

    async getAverageRatingForUser(userId:string){

    }

    async getRatingsByStatus(status:"PUBLISHED" | "REJECTED" | "PENDING"){

    }

    async deleteRating(ratingId:string){

    }

    async getRatingById(ratingId:string){

    }

}