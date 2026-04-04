import { BadRequestException, Body, ConflictException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { SigninDto } from "./dtos/signin.dto";
import { RegisterUserDto } from "./dtos/register-user.dto";
import { UserService } from "../user/user.service";
import { EncoderProvider } from "src/common/providres/encoder.provider";
import { PrismaService } from "../prisma/prisma.service";
import { JwtService } from "@nestjs/jwt";
import { User, UserRole } from "generated/prisma/client";
import { AdminSigninDto } from "./dtos/admin-signin.dto";
import { SMTPProvider } from "src/common/providres/smtp.provider";
import type { ConfigType } from "@nestjs/config";
import jwtConfig from "src/config/jwt.config";
import { TokenPayload } from "./types/TokenPayload.type";
import { sign } from "crypto";
import otpEmailTemplate from "src/common/templates/emailVerification.template";
import welcomeEmailTemplate from "src/common/templates/welcomeEmail.template";

@Injectable()
export class AuthService {
    private readonly logger = new Logger(AuthService.name);

    constructor(
        private readonly userService: UserService,
        private readonly encoder: EncoderProvider,
        private readonly prismaService: PrismaService,
        private readonly jwtService: JwtService,
        @Inject(jwtConfig.KEY)
        private readonly jwtConfigOptions: ConfigType<typeof jwtConfig>,
        private readonly smtpProvider:SMTPProvider
    ) { }

    /**
     * Sign in with licence_id or nick_name
     * @param signInDto 
     * @returns 
     */
    async signin(signInDto: SigninDto) {

        const user = await this.userService.findUserByIdentifier(signInDto.identifier);

        if (!user) {
            throw new NotFoundException("No account found with this identifier!");
        }

        if (user.is_blocked) {
            throw new BadRequestException("Your account has been blocked. Please contact support for assistance.");
        }
        if (user.is_deleted) {
            throw new BadRequestException("Your account has been deleted. If you think this is a mistake, please contact support.");
        }

        if(!user.email_verified){
            this.sendEmailVerificationCode(user.id, user.name!, user.email)
            return {
                message:"Verification email sent to your email. Kindly Verify your email",
                is_email_verified:user.email_verified,
                role:user.role
            }
        }

        if (!(await this.comparePassword(signInDto.password, user.password))) {
            throw new BadRequestException("Invalid credentials!");
        }

        const token = await this.signJwtToken(user);
        this.logger.log(`${user.nick_name ?? user.name} logged in.`);

        if(signInDto.fcm_token){
        await this.prismaService.user.update({
            where: { id: user.id },
            data: {
                fcm_token: signInDto.fcm_token
            }
        })
    }

        return { ...user, token };
    }


    /**
     * Generate JWT token
     * @param user 
     * @returns 
     */
    private async signJwtToken(user: User) {
        const payload: TokenPayload = {
            id: user.id,
            role: user.role,
            ...(user.role === UserRole.ADMIN
                ? { email: user.email, name: user.name }
                : { licence_id: user.licence_id, nick_name: user.nick_name }
            )
        };

        return await this.jwtService.signAsync(payload, {
            expiresIn: (this.jwtConfigOptions.expires_in as any) || "90d",
            secret: this.jwtConfigOptions.jwt_secret
        });
    }

    /**
     * Register new user
     * @param registerUserDto 
     * @returns 
     */
    async registerUser(@Body() registerUserDto: RegisterUserDto) {

        const existingNickName = await this.prismaService.user.findUnique({where:{nick_name:registerUserDto.nick_name}})

        if(existingNickName){
            throw new ConflictException("Nick name already exist.Try another one.")
        }

        const existingEmail= await this.prismaService.user.findUnique({
            where: { email: registerUserDto.email}
        });

        if(existingEmail){
            throw new ConflictException('This email is already associated with an email. Kindly try another email.')
        }

        // Check if licence_id already exists
        const existingLicence = await this.prismaService.user.findMany({
            where: { licence_id: registerUserDto.licence_id}
        });

        if (existingLicence.length >=5) {
            throw new ConflictException('This licence ID is already associated with 5 accounts.');
        }

        // Check if nick_name already exists
        const existingNickname = await this.prismaService.user.findFirst({
            where: { nick_name: registerUserDto.nick_name }
        });

        if (existingNickname) {
            throw new ConflictException('This nickname is already taken!');
        }

        if (registerUserDto.password !== registerUserDto.confirmPassword) {
            throw new BadRequestException("Password and confirm password do not match");
        }

        const { confirmPassword, ...userData } = registerUserDto;
        const user = await this.userService.addUser(userData);

         this.smtpProvider.sendMail(
            user.email,
            "Welcome to PLATEChatter",
            welcomeEmailTemplate({ name: user.name || user.nick_name || "User" })
        );

        // this.sendEmailVerificationCode(user.id, user.name!, user.email)

        return { message: "Verification email sent to the email", user: { id: user.id, licence_id: user.licence_id, nick_name: user.nick_name,is_email_verified:user.email_verified } };
    }

    /**
     * Compare password with hash
     * @param password 
     * @param hash 
     * @returns 
     */
    private async comparePassword(password: string, hash: string): Promise<boolean> {
        const res = await this.encoder.compare(password, hash);
        return res;
    }

    /**
     * Get authenticated user details
     * @param userId 
     * @returns 
     */
    async getAuthenticatedUser(userId: string) {
        const userDetails = await this.userService.findUserById(userId);
        return userDetails;
    }

    /**
     * Send OTP to user email
     * @param email 
     * @returns 
     */
    async sendOtpToEmail(email: string) {
        const user = await this.prismaService.user.findFirst({ where: { email } });

        if (!user) {
            throw new NotFoundException("User not found");
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

        await this.prismaService.user.update({
            where: { id: user.id },
            data: { otp, otp_expires: otpExpires }
        });

        this.smtpProvider.sendMail(
            email,
            "OTP for email veirification",
            otpEmailTemplate({ otp })
        );

        return { message: "OTP sent successfully" };
    }

     /**
     * 
     * @param email 
     * @returns 
     */
    async resendEmailVerificationCode(email:string){
        const user = await this.userService.findUserByEmail(email)

        if(!user){
            throw new NotFoundException("user not found")
        }
        await this.sendEmailVerificationCode(user.id, user.name || "User",user.email)

        return {message:"email verification code resent successfully"}
    }
    
    /**
     * 
     * @param name 
     * @param email 
     */

    private async sendEmailVerificationCode(userId:string, name:string, email:string){

        const code = this.generateEmailVerificationCode()
        const expirationTime = new Date(Date.now() + 10 * 60 * 1000)
        this.prismaService.user.update({where:{id:userId}, data:{otp:code, otp_expires:expirationTime}})
        const emailTemplate = ({name,verificationCode:code, verificationCodeExpire:10})

        this.smtpProvider.sendMail(email, "Email Verification code", otpEmailTemplate({name, otp:code}))
    }

     /**
     * 
     * @returns 
     */

    private generateEmailVerificationCode(){

        return Math.round(100000 + Math.random() * 900000).toString()
    }
}