import { Expose } from "class-transformer"

export class RoomParticipantDto {

    @Expose()
    id:string

    @Expose()
    avatar:string

    @Expose()
    fullName:string

}