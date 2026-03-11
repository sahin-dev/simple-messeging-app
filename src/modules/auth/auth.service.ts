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

@Injectable()
export class AuthService {
    private readonly logger = new Logger(AuthService.name);

    constructor(
        private readonly userService: UserService,
        private readonly encoder: EncoderProvider,
        private readonly prismaService: PrismaService,
        private readonly jwtService: JwtService,
        @Inject(jwtConfig.KEY)
        private readonly jwtConfigOptions: ConfigType<typeof jwtConfig>
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

        return { message: "User registered successfully", user: { id: user.id, licence_id: user.licence_id, nick_name: user.nick_name } };
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
}