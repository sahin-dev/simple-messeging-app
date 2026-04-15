export class UpdateRatingStatusDto {

    ratingId:string
    status:"PUBLISHED" | "REJECTED" | "PENDING"
}