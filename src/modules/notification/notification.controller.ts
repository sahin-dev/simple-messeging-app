import { Body, Controller, Get, Param, Patch, Post, Put, Query, Req } from "@nestjs/common";
import { NotificationService } from "./notification.service";
import { CreateNotificationDto } from "./dtos/create-notification.dto";
import { ResponseMessage } from "src/common/decorators/apiResponseMessage.decorator";
import { PaginationDto } from "src/common/dtos/pagination.dto";
import { TokenPayload } from "../auth/types/TokenPayload.type";
import { plainToInstance } from "class-transformer";
import { Roles } from "src/common/decorators/role.decorator";
import { UserRole } from "generated/prisma/enums";
import { UserNotificationsResponseDto } from "./dtos/user-notifications-reponse.dto";

@Controller({
    path:"notifications"
})
export class NotificationController {

    constructor(private readonly notificationService:NotificationService){}

    @Post()
    @ResponseMessage("notification created successfully")
    async createNotification(@Body()createNotificationDto:CreateNotificationDto){
        const createdNotification = await this.notificationService.createNotification(createNotificationDto)

        return createdNotification
        
    }

    // @Get("users")
    // @ResponseMessage("notifications fetched successfully")
    // async getUserNotifications(@Req() request:Request, @Query()pagination:PaginationDto){
    
    //     const tokenPayload = request['payload'] as TokenPayload
    //     console.log(tokenPayload)
    //     const notifications = await this.notificationService.getNotifications(tokenPayload.id, pagination)
     
    //     return plainToInstance(UserNotificationsResponseDto, notifications, {
    //         excludeExtraneousValues: true
    //     })
    // }

//    @Get("admin")
//    @Roles(UserRole.ADMIN)
//     @ResponseMessage("notifications fetched successfully")
//     async getAdminNotifications( @Query()pagination:PaginationDto){

//         const notifications = await this.notificationService.getAdminNotifications(pagination)
        

//         return plainToInstance(UserNotificationsResponseDto, notifications, {
//             excludeExtraneousValues: true
//         })
//     }

    // @Get("count")
    // @ResponseMessage("new notification count fetched successfully")
    // async getNewNotificationCount(@Req() request:Request){
    //     const tokenPayload = request['payload'] as TokenPayload

    //     const count = await this.notificationService.getNewNotificationCount(tokenPayload.id)

    //     return {
    //         count
    //     }
    // }

    // @Patch("/:notificationId")
    // @ResponseMessage("notification updated successfully")
    // async updateNotificationStatus(@Req() request:Request, @Param("notificationId") notificationId:string){

    //     const tokenPayload = request['payload'] as TokenPayload

    //     await this.notificationService.updateNotificatinStatus(tokenPayload.id,notificationId)
    // }

   

}