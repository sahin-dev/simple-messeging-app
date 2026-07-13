import { Expose, Transform } from "class-transformer";
import { UserRole } from "generated/prisma/enums";

export class UserResponseDto {

    @Expose()
    id: string

    @Expose()
    @Transform(obj => {

        if (obj.value) {
            let value = obj.value as string
            value = value.replaceAll("\\", "\/")
            return `${value}`
        }
    })

    avatar: string

    @Expose({ groups: [UserRole.ADMIN] })
    name: string

    @Expose({ groups: [UserRole.ADMIN, UserRole.USER] })
    email: string

    @Expose()
    phone: string

    @Expose()
    role: string

    @Expose({
        groups: [UserRole.ADMIN]
    })
    is_more_options_accepted: boolean

    @Expose({ groups: [UserRole.USER] })
    licence_id: string

    @Expose({ groups: [UserRole.USER] })
    nick_name: string

    @Expose()
    license_no_verified: boolean

    @Expose({
        groups: [UserRole.ADMIN]
    })
    is_blocked: boolean

    @Expose()
    designation: string

    @Expose()
    @Transform(obj => {
        if (!obj.value)
            return obj.value
        return new Date(obj.value).toLocaleDateString()
    })
    dob: string

    @Expose({
        groups: ['admin']
    })
    email_verified: boolean

    @Expose({
        groups: ['admin']
    })
    is_deleted: boolean

    @Expose()
    rating?: number

    @Expose()
    totalRating?: number

    @Expose()
    totalRatings?: number

    @Expose({
        groups: ['admin']
    })
    subscription_end_at: Date

    @Expose({
        groups: ['admin']
    })
    is_subscription_active: boolean

    @Expose({
        groups: ['admin']
    })
    total_created_sessions: number

    @Expose({
        groups: ['admin']
    })
    total_cancelled_sessions: number

    @Expose()
    vehicle_type: string

    @Expose()
    vehicle_model: string

    @Expose()
    vehicle_color: string

    @Expose()
    is_vehicle_verified: boolean

    @Expose()
    is_vehicle_ownership_document_submitted: boolean

    @Expose()
    country?: string

    @Expose()
    city?: string

    @Expose()
    isOnline?: boolean

    @Expose()
    lastSeenAt?: Date | string | null
}
