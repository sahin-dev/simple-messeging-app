import { Expose, Type } from "class-transformer"
import { RoomParticipantDto } from "./room-participant.dto"
import { ValidateNested } from "class-validator"

export class SingleMessageDto {
    @Expose()
    id:string

    @Expose()
    is_read:boolean

    @Expose()
    is_delivered:boolean

    @Expose()
    chatRoom_id:string

    @Expose()
    is_mine:boolean

    @Expose()
    @ValidateNested()
    @Type(() => RoomParticipantDto)
    sender:RoomParticipantDto

    @Expose()
    @ValidateNested()
    @Type(() => RoomParticipantDto)
    receiver:RoomParticipantDto

    @Expose()
    message:string

    @Expose({
        name:"createdAt"
    })
    timestamps:Date

}