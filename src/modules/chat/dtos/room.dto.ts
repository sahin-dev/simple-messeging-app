import { Expose, Type } from "class-transformer"
import { RoomParticipantDto } from "./room-participant.dto"
import { ValidateNested } from "class-validator"


class LatestMessageDto {

    @Expose()
    message:string

    @Expose()
    is_read:boolean

    @Expose()
    is_mine:boolean
    
    @Expose()
    is_delivered:boolean

    @Expose()
    @ValidateNested()
    @Type(() => RoomParticipantDto)
    sender:RoomParticipantDto

    @Expose({
        name:"createdAt"
    })
    timestamps:Date
}
export class RoomDto {
    @Expose()
    id:string

    @Expose({
        name:"new"
    })
    new_message_count:number

    @Expose({
        name:"members"
    })
    @ValidateNested()
    @Type(() => RoomParticipantDto)
    partners:RoomParticipantDto[]

    @Expose({
        name:"latest_message"
    })
    @ValidateNested()
    @Type(() => LatestMessageDto)
    latest_message:LatestMessageDto



}