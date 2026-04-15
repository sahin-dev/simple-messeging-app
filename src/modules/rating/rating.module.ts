import { Module,ModuleMetadata } from "@nestjs/common";
import { RatingService } from "./rating.service";
import { RatingController } from "./rating.controller";

const metadata: ModuleMetadata = {
    controllers:[RatingController],
    providers:[RatingService]   
}


@Module(metadata)
export class RatingModule {

}