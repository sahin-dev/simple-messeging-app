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

    @Expose()
    type: string

    @Expose()
    encryptionType?: string

    @Expose()
    encryptionVersion?: number

    @Expose()
    senderKeyId?: string

    @Expose()
    receiverKeyId?: string

    @Expose()
    nonce?: string

    @Expose()
    file_url?: string

    @Expose()
    file_name?: string

    @Expose()
    file_size?: number

    @Expose()
    file_mime_type?: string

    @Expose()
    durationSeconds?: number

    @Expose()
    waveform?: number[]

    @Expose({
        name:"createdAt"
    })
    timestamps:Date
}
