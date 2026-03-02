import { Expose } from "class-transformer"
import { UserRole } from "generated/prisma/enums"

export class SignInResponseDto {

    @Expose()
    id: string

    @Expose({ groups: [UserRole.ADMIN] })
    name: string

    @Expose({ groups: [UserRole.ADMIN] })
    email: string

    @Expose({ groups: [UserRole.USER] })
    licence_id: string

    @Expose({ groups: [UserRole.USER] })
    nick_name: string

    @Expose()
    phone: string

    @Expose()
    email_verified: boolean

    @Expose()
    role: string

    @Expose()
    token: string


}