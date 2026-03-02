// import { Injectable } from "@nestjs/common";
// import { Otp } from "generated/prisma/client";

// @Injectable()
// export class OtpGenerator{

//     generate():number{
//         return Math.round(100000 + Math.random() * 900000)
//     }

//    checkOtpValidity(input:number, otp:Otp):boolean{
//         if(otp.code !== input || this.isExpired(otp.expires_in) ){
//             return true
//         }

//         return false
//     }

//     private isExpired(dateTime:Date){
//         const expirationTIme = new Date(dateTime)
//         const currentTime = new Date(Date.now())

//         if(currentTime > expirationTIme){
//             return false
//         }

//         return true
//     }
// }