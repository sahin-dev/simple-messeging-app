import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateNotificationDto } from "./dtos/create-notification.dto";
import { FireBaseClient } from "./providers/firebase.provider";


@Injectable()
export class NotificationService {

    constructor(private readonly prismaService:PrismaService,
        private readonly firebaseClient:FireBaseClient
    ){}

    async createNotification(createNotificationDto:CreateNotificationDto){

        const user = await this.prismaService.user.findFirst({where:{id:createNotificationDto.userId}})
        if(!user){
            throw new BadRequestException("user not found")
        }

        // const createdNotification = await this.prismaService.notification.create({
        //     data:{
        //         message:createNotificationDto.message, 
        //         title:createNotificationDto.title, 
        //         user_id:createNotificationDto.userId, 
        //         level:createNotificationDto.level, 
        //         audience:createNotificationDto.audience
        //     }
        // })
        
        try{
            
            if(user.fcm_token){
                this.firebaseClient.sendPushNotification(user.fcm_token, createNotificationDto.title, createNotificationDto.message)
            }
    

        }catch(err){
            console.log("Push notification sending failed: ", err)
        }

    }

    // async getNotifications(userId:string, pagination:PaginationDto){
    //     const skip = (pagination.page - 1) * pagination.limit
 
    //     const [notifications, total] = await this.prismaService.$transaction([
    //         this.prismaService.notification.findMany({
    //             where:{user_id:userId, audience:Audience.USER},
    //             orderBy:{createdAt:"desc"},
    //             skip,
    //             take:pagination.limit
    //         }),
    //         this.prismaService.notification.count({where:{user_id:userId, audience:Audience.USER}, skip, take:pagination.limit})
    //     ])


    //     // update notification read status
    //     await this.prismaService.notification.updateMany({where:{user_id:userId, is_read:false}, data:{is_read:true}})

    //     return {notifications, total}
    // }

    // async getAdminNotifications(pagination:PaginationDto){
    //     const skip = (pagination.page - 1) * pagination.limit

    //     const [adminNotifications, total] = await this.prismaService.$transaction([
    //         this.prismaService.notification.findMany({
    //             where:{audience:Audience.ADMIN},
    //             orderBy:{createdAt:"desc"},
    //             skip,
    //             take:pagination.limit
    //         }),
    //         this.prismaService.notification.count({where:{audience:Audience.ADMIN}})
    //     ])

    //     await this.prismaService.notification.updateMany({where:{audience:Audience.ADMIN, is_read:false}, data:{is_read:true}})

    //     return {adminNotifications, total}
    // }

    // async updateNotificatinStatus(userId:string, notificationId:string){

    //     const notification = await this.prismaService.notification.findUnique({where:{id:notificationId}})

    //     if(!notification){
    //         throw new NotFoundException("notification not found")
    //     }

    //     await this.prismaService.notification.update({where:{id:notification.id}, data:{is_read:true}})

    // }

    // async getNewNotificationCount(userId:string){
    //     const newNotifications = await this.prismaService.notification.count({where:{
    //         is_read:false,
    //         user_id:userId,
    //     }})

    //     return newNotifications
    // }

}