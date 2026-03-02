import { UserRole } from "generated/prisma/enums"

export type TokenPayload = {
    id: string
    licence_id?: string | null,
    role: UserRole,
    nick_name?: string | null,
    email?: string | null,
    name?: string | null

}