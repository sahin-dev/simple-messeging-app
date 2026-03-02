import { Inject, Injectable } from "@nestjs/common";
import type{ ConfigType } from "@nestjs/config";
import nodemailer, { Transporter } from 'nodemailer'
import mailerConfig, { MailerConfig } from "src/config/mailer.config";

@Injectable()
export class SMTPProvider {


    private transporter:Transporter
    constructor(@Inject(mailerConfig.KEY)private readonly mailerConfiguration:ConfigType<typeof MailerConfig>){

        this.transporter = nodemailer.createTransport({
            service:'gmail',
            auth:{
                user: this.mailerConfiguration.user,
                pass: this.mailerConfiguration.password
            }
        })
    }

    sendMail(to:string, subject:string, body:string){
        if(!this.transporter){
            throw new Error("transporter does not initialized yet!")
        }

        this.transporter.sendMail({
            to,
            subject,
            html:body
        })
    }
}