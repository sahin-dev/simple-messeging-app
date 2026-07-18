import { BadRequestException, ConflictException, Inject, Injectable, InternalServerErrorException, Logger, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { SigninDto } from "./dtos/signin.dto";
import { RegisterUserDto } from "./dtos/register-user.dto";
import { UserService } from "../user/user.service";
import { EncoderProvider } from "src/common/providres/encoder.provider";
import { PrismaService } from "../prisma/prisma.service";
import { JwtService } from "@nestjs/jwt";
import { AuthProvider, User, UserRole } from "generated/prisma/client";
import { SMTPProvider } from "src/common/providres/smtp.provider";
import type { ConfigType } from "@nestjs/config";
import jwtConfig from "src/config/jwt.config";
import firebaseConfigType from "src/config/firebase.config";
import appleConfigType from "src/config/apple.config";
import { TokenPayload } from "./types/TokenPayload.type";
import otpEmailTemplate from "src/common/templates/emailVerification.template";
import welcomeEmailTemplate from "src/common/templates/welcomeEmail.template";
import { RatingService } from "../rating/rating.service";
import { cert, getApps, initializeApp, type App, type ServiceAccount } from "firebase-admin/app";
import { getAuth, type DecodedIdToken } from "firebase-admin/auth";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { GoogleSigninDto } from "./dtos/google-signin.dto";
import { CheckAuthAvailabilityDto } from "./dtos/check-auth-availability.dto";
import { AppleSigninDto } from "./dtos/apple-signin.dto";
import { GoogleAuthStatusDto } from "./dtos/google-auth-status.dto";

type AppleJwtHeader = {
    alg?: string;
    kid?: string;
}

type AppleJwtPayload = {
    iss?: string;
    aud?: string | string[];
    exp?: number;
    sub?: string;
    email?: string;
    email_verified?: boolean | string;
    nonce?: string;
}

type AppleJwk = crypto.JsonWebKey & {
    kid?: string;
}

type AppleJwksResponse = {
    keys?: AppleJwk[];
}

@Injectable()
export class AuthService {
    private readonly logger = new Logger(AuthService.name);
    private readonly maxAccountsPerLicenceId = 3;
    private appleKeysCache?: { keys: AppleJwk[]; expiresAt: number };

    constructor(
        private readonly userService: UserService,
        private readonly encoder: EncoderProvider,
        private readonly prismaService: PrismaService,
        private readonly jwtService: JwtService,
        @Inject(jwtConfig.KEY)
        private readonly jwtConfigOptions: ConfigType<typeof jwtConfig>,
        @Inject(firebaseConfigType.KEY)
        private readonly firebaseConfig: ConfigType<typeof firebaseConfigType>,
        @Inject(appleConfigType.KEY)
        private readonly appleConfig: ConfigType<typeof appleConfigType>,
        private readonly smtpProvider: SMTPProvider,
        private readonly ratingService: RatingService
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

        // if(!user.email_verified){
        //     this.sendEmailVerificationCode(user.id, user.name!, user.email)
        //     return {
        //         message:"Verification email sent to your email. Kindly Verify your email",
        //         is_email_verified:user.email_verified,
        //         role:user.role
        //     }
        // }

        if (!user.password) {
            throw new BadRequestException(`This account uses ${this.formatAuthProvider(user.auth_provider)} sign in. Please sign in with ${this.formatAuthProvider(user.auth_provider)}.`);
        }

        if (!(await this.comparePassword(signInDto.password, user.password))) {
            throw new BadRequestException("Invalid credentials!");
        }

        const token = await this.signJwtToken(user);
        this.logger.log(`${user.nick_name ?? user.name} logged in.`);

        if (signInDto.fcm_token) {
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
    async registerUser(registerUserDto: RegisterUserDto) {

        await this.assertNickNameAvailable(registerUserDto.nick_name);

        const existingEmail = await this.prismaService.user.findUnique({
            where: { email: registerUserDto.email }
        });

        if (existingEmail) {
            throw new ConflictException('This email is already associated with an email. Kindly try another email.')
        }

        await this.assertLicenceIdAvailable(registerUserDto.licence_id);

        if (registerUserDto.password !== registerUserDto.confirmPassword) {
            throw new BadRequestException("Password and confirm password do not match");
        }

        const { confirmPassword, ...userData } = registerUserDto;
        const user = await this.userService.addUser(userData);


        this.smtpProvider.sendMail(
            user.email,
            "Welcome to PLATEChatter",
            welcomeEmailTemplate({ name: user.name || user.nick_name || "User" })
        ).then(() => {
            this.logger.log(`Welcome email sent to ${user.email}`)
        })

        const token = await this.signJwtToken(user);

        return { ...user, token };
    }

    async googleSignin(googleSigninDto: GoogleSigninDto) {
        const decodedToken = await this.verifyFirebaseGoogleToken(googleSigninDto.idToken);
        const email = decodedToken.email?.trim().toLowerCase();

        if (!email) {
            throw new BadRequestException("Google account email is required.");
        }

        if (decodedToken.email_verified === false) {
            throw new BadRequestException("Google account email must be verified.");
        }

        const googleSub = this.getGoogleSubject(decodedToken);
        const existingUser = await this.findGoogleUser(decodedToken.uid, googleSub, email);

        if (existingUser) {
            this.ensureUserCanAuthenticate(existingUser);

            const user = await this.prismaService.user.update({
                where: { id: existingUser.id },
                data: {
                    firebase_uid: existingUser.firebase_uid ?? decodedToken.uid,
                    google_sub: existingUser.google_sub ?? googleSub,
                    email_verified: decodedToken.email_verified ?? existingUser.email_verified,
                    ...(googleSigninDto.fcm_token ? { fcm_token: googleSigninDto.fcm_token } : {}),
                    ...(existingUser.password ? {} : { auth_provider: AuthProvider.GOOGLE }),
                },
            });

            const token = await this.signJwtToken(user);
            this.logger.log(`${user.nick_name ?? user.name ?? user.email} signed in with Google.`);

            return { ...user, token, requiresOnboarding: false };
        }

        this.assertGoogleOnboardingFields(googleSigninDto);
        await this.assertLicenceIdAvailable(googleSigninDto.licence_id);

        const nickName = await this.resolveGoogleNickName(googleSigninDto.nick_name!, email, decodedToken.name);

        const user = await this.prismaService.user.create({
            data: {
                email,
                name: decodedToken.name,
                avatar: decodedToken.picture,
                nick_name: nickName,
                licence_id: googleSigninDto.licence_id,
                designation: googleSigninDto.designation,
                is_more_options_accepted: googleSigninDto.is_more_options_accepted ?? false,
                vehicle_type: googleSigninDto.vehicle_type,
                vehicle_model: googleSigninDto.vehicle_model,
                vehicle_color: googleSigninDto.vehicle_color,
                country: googleSigninDto.country,
                city: googleSigninDto.city,
                fcm_token: googleSigninDto.fcm_token,
                auth_provider: AuthProvider.GOOGLE,
                firebase_uid: decodedToken.uid,
                google_sub: googleSub,
                email_verified: decodedToken.email_verified ?? true,
            },
        });

        this.smtpProvider.sendMail(
            user.email,
            "Welcome to PLATEChatter",
            welcomeEmailTemplate({ name: user.name || user.nick_name || "User" })
        ).then(() => {
            this.logger.log(`Welcome email sent to ${user.email}`)
        })

        const token = await this.signJwtToken(user);

        return { ...user, token, requiresOnboarding: true };
    }

    async getGoogleAuthStatus(googleAuthStatusDto: GoogleAuthStatusDto) {
        const decodedToken = await this.verifyFirebaseGoogleToken(googleAuthStatusDto.idToken);
        const email = decodedToken.email?.trim().toLowerCase();

        if (!email) {
            throw new BadRequestException("Google account email is required.");
        }

        if (decodedToken.email_verified === false) {
            throw new BadRequestException("Google account email must be verified.");
        }

        const googleSub = this.getGoogleSubject(decodedToken);
        const existingUser = await this.findGoogleUser(decodedToken.uid, googleSub, email);

        if (existingUser) {
            this.ensureUserCanAuthenticate(existingUser);
        }

        return {
            registered: Boolean(existingUser),
            requiresOnboarding: !existingUser,
            provider: "GOOGLE",
            email,
            name: decodedToken.name ?? null,
            picture: decodedToken.picture ?? null,
            missingFields: existingUser ? [] : ["nick_name", "licence_id"],
        };
    }

    async appleSignin(appleSigninDto: AppleSigninDto) {
        const decodedToken = await this.verifyAppleIdentityToken(appleSigninDto.identityToken, appleSigninDto.nonce);
        const email = decodedToken.email?.trim().toLowerCase();

        if (email && !this.isAppleEmailVerified(decodedToken.email_verified)) {
            throw new BadRequestException("Apple account email must be verified.");
        }

        const existingUser = await this.prismaService.user.findFirst({
            where: {
                OR: [
                    { apple_sub: decodedToken.sub },
                    ...(email ? [{ email }] : []),
                ],
            },
        });

        if (existingUser) {
            this.ensureUserCanAuthenticate(existingUser);

            const user = await this.prismaService.user.update({
                where: { id: existingUser.id },
                data: {
                    apple_sub: existingUser.apple_sub ?? decodedToken.sub,
                    email_verified: email ? this.isAppleEmailVerified(decodedToken.email_verified) : existingUser.email_verified,
                    ...(appleSigninDto.fcm_token ? { fcm_token: appleSigninDto.fcm_token } : {}),
                    ...(existingUser.password ? {} : { auth_provider: AuthProvider.APPLE }),
                },
            });

            const token = await this.signJwtToken(user);
            this.logger.log(`${user.nick_name ?? user.name ?? user.email} signed in with Apple.`);

            return { ...user, token, requiresOnboarding: false };
        }

        if (!email) {
            throw new BadRequestException("Apple account email is required for first sign in.");
        }

        await this.assertLicenceIdAvailable(appleSigninDto.licence_id);

        const nickName = await this.resolveGoogleNickName(appleSigninDto.nick_name, email, appleSigninDto.name);

        const user = await this.prismaService.user.create({
            data: {
                email,
                name: appleSigninDto.name,
                nick_name: nickName,
                licence_id: appleSigninDto.licence_id,
                designation: appleSigninDto.designation,
                is_more_options_accepted: appleSigninDto.is_more_options_accepted ?? false,
                vehicle_type: appleSigninDto.vehicle_type,
                vehicle_model: appleSigninDto.vehicle_model,
                vehicle_color: appleSigninDto.vehicle_color,
                country: appleSigninDto.country,
                city: appleSigninDto.city,
                fcm_token: appleSigninDto.fcm_token,
                auth_provider: AuthProvider.APPLE,
                apple_sub: decodedToken.sub,
                email_verified: this.isAppleEmailVerified(decodedToken.email_verified),
            },
        });

        this.smtpProvider.sendMail(
            user.email,
            "Welcome to PLATEChatter",
            welcomeEmailTemplate({ name: user.name || user.nick_name || "User" })
        ).then(() => {
            this.logger.log(`Welcome email sent to ${user.email}`)
        })

        const token = await this.signJwtToken(user);

        return { ...user, token, requiresOnboarding: true };
    }

    async checkAvailability(checkAvailabilityDto: CheckAuthAvailabilityDto) {
        const licenceId = checkAvailabilityDto.licence_id ?? checkAvailabilityDto.license_id;

        if (!checkAvailabilityDto.nick_name && !licenceId) {
            throw new BadRequestException("At least one of nick_name or licence_id is required.");
        }

        const [nickNameAvailability, licenceIdAvailability] = await Promise.all([
            checkAvailabilityDto.nick_name ? this.getNickNameAvailability(checkAvailabilityDto.nick_name) : null,
            licenceId ? this.getLicenceIdAvailability(licenceId) : null,
        ]);

        const availabilityResults = [nickNameAvailability, licenceIdAvailability].filter((availability) => availability !== null);

        return {
            available: availabilityResults.every((availability) => availability.available),
            nick_name: nickNameAvailability,
            licence_id: licenceIdAvailability,
        };
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

    private ensureUserCanAuthenticate(user: User) {
        if (user.is_blocked) {
            throw new BadRequestException("Your account has been blocked. Please contact support for assistance.");
        }
        if (user.is_deleted) {
            throw new BadRequestException("Your account has been deleted. If you think this is a mistake, please contact support.");
        }
    }

    private async findGoogleUser(firebaseUid: string, googleSub: string | undefined, email: string) {
        return this.prismaService.user.findFirst({
            where: {
                OR: [
                    { firebase_uid: firebaseUid },
                    ...(googleSub ? [{ google_sub: googleSub }] : []),
                    { email },
                ],
            },
        });
    }

    private assertGoogleOnboardingFields(googleSigninDto: GoogleSigninDto) {
        const missingFields = [
            !googleSigninDto.nick_name ? "nick_name" : null,
            !googleSigninDto.licence_id ? "licence_id" : null,
        ].filter((field): field is string => Boolean(field));

        if (missingFields.length > 0) {
            throw new BadRequestException({
                message: "Google account requires onboarding before registration.",
                requiresOnboarding: true,
                missingFields,
            });
        }
    }

    private formatAuthProvider(authProvider: AuthProvider) {
        switch (authProvider) {
            case AuthProvider.GOOGLE:
                return "Google";
            case AuthProvider.APPLE:
                return "Apple";
            default:
                return "social";
        }
    }

    private async assertNickNameAvailable(nickName: string) {
        const availability = await this.getNickNameAvailability(nickName);

        if (!availability.available) {
            throw new ConflictException("Nick name already taken.Try another one.");
        }
    }

    private async assertLicenceIdAvailable(licenceId?: string) {
        if (!licenceId) {
            return;
        }

        const availability = await this.getLicenceIdAvailability(licenceId);

        if (!availability.available) {
            throw new ConflictException("This licence ID is already associated with 3 accounts.");
        }
    }

    private async getNickNameAvailability(nickName: string) {
        const existingNickName = await this.prismaService.user.findFirst({
            where: {
                nick_name: {
                    equals: nickName,
                    mode: "insensitive",
                },
            },
            select: { id: true },
        });

        return {
            value: nickName,
            available: !existingNickName,
            is_taken: Boolean(existingNickName),
        };
    }

    private async getLicenceIdAvailability(licenceId: string) {
        const associatedAccounts = await this.prismaService.user.count({
            where: {
                licence_id: {
                    equals: licenceId,
                    mode: "insensitive",
                },
            },
        });

        return {
            value: licenceId,
            available: associatedAccounts < this.maxAccountsPerLicenceId,
            associated_accounts: associatedAccounts,
            max_accounts: this.maxAccountsPerLicenceId,
        };
    }

    private async verifyAppleIdentityToken(identityToken: string, nonce?: string) {
        if (this.appleConfig.clientIds.length === 0) {
            throw new InternalServerErrorException("Apple login is not configured. Set APPLE_CLIENT_ID, APPLE_BUNDLE_ID, APPLE_SERVICE_ID, or APPLE_CLIENT_IDS.");
        }

        const tokenParts = identityToken.split(".");
        if (tokenParts.length !== 3) {
            throw new UnauthorizedException("Invalid Apple identity token.");
        }

        const [encodedHeader, encodedPayload, encodedSignature] = tokenParts;
        const header = this.decodeJwtPart<AppleJwtHeader>(encodedHeader);
        const payload = this.decodeJwtPart<AppleJwtPayload>(encodedPayload);

        if (header.alg !== "RS256" || !header.kid) {
            throw new UnauthorizedException("Invalid Apple identity token header.");
        }

        const publicKey = await this.getApplePublicKey(header.kid);
        const isSignatureValid = crypto.verify(
            "RSA-SHA256",
            Buffer.from(`${encodedHeader}.${encodedPayload}`),
            crypto.createPublicKey({ key: publicKey, format: "jwk" }),
            this.base64UrlToBuffer(encodedSignature),
        );

        if (!isSignatureValid) {
            throw new UnauthorizedException("Invalid Apple identity token signature.");
        }

        if (payload.iss !== "https://appleid.apple.com") {
            throw new UnauthorizedException("Invalid Apple identity token issuer.");
        }

        if (!this.isExpectedAppleAudience(payload.aud)) {
            throw new UnauthorizedException("Invalid Apple identity token audience.");
        }

        if (!payload.exp || payload.exp * 1000 <= Date.now()) {
            throw new UnauthorizedException("Apple identity token has expired.");
        }

        if (!payload.sub) {
            throw new UnauthorizedException("Apple identity token subject is missing.");
        }

        if (nonce && payload.nonce !== nonce) {
            throw new UnauthorizedException("Invalid Apple identity token nonce.");
        }

        return payload as AppleJwtPayload & { sub: string };
    }

    private async getApplePublicKey(kid: string) {
        const keys = await this.getApplePublicKeys();
        const key = keys.find((appleKey) => appleKey.kid === kid);

        if (!key) {
            throw new UnauthorizedException("Apple identity token key is not recognized.");
        }

        return key;
    }

    private async getApplePublicKeys() {
        if (this.appleKeysCache && this.appleKeysCache.expiresAt > Date.now()) {
            return this.appleKeysCache.keys;
        }

        let response: Response;

        try {
            response = await fetch(this.appleConfig.keysUrl);
        } catch (error) {
            this.logger.error("Failed to fetch Apple public keys", error);
            throw new InternalServerErrorException("Unable to verify Apple identity token.");
        }

        if (!response.ok) {
            throw new InternalServerErrorException("Unable to fetch Apple public keys.");
        }

        const body = await response.json() as AppleJwksResponse;
        const keys = body.keys ?? [];

        if (keys.length === 0) {
            throw new InternalServerErrorException("Apple public keys response was empty.");
        }

        this.appleKeysCache = {
            keys,
            expiresAt: Date.now() + 60 * 60 * 1000,
        };

        return keys;
    }

    private decodeJwtPart<T>(part: string): T {
        try {
            return JSON.parse(this.base64UrlToBuffer(part).toString("utf8")) as T;
        } catch {
            throw new UnauthorizedException("Invalid Apple identity token.");
        }
    }

    private base64UrlToBuffer(value: string) {
        const paddedValue = value.padEnd(value.length + (4 - value.length % 4) % 4, "=");
        return Buffer.from(paddedValue.replace(/-/g, "+").replace(/_/g, "/"), "base64");
    }

    private isExpectedAppleAudience(audience?: string | string[]) {
        if (!audience) {
            return false;
        }

        const audiences = Array.isArray(audience) ? audience : [audience];

        return audiences.some((item) => this.appleConfig.clientIds.includes(item));
    }

    private isAppleEmailVerified(emailVerified?: boolean | string) {
        return emailVerified === true || emailVerified === "true";
    }

    private async verifyFirebaseGoogleToken(idToken: string) {
        let decodedToken: DecodedIdToken;

        try {
            decodedToken = await getAuth(this.getFirebaseApp()).verifyIdToken(idToken);
        } catch (error) {
            this.logger.warn(`Invalid Google sign-in token: ${error instanceof Error ? error.message : String(error)}`);
            throw new UnauthorizedException("Invalid Google sign-in token.");
        }

        const provider = decodedToken.firebase?.sign_in_provider;
        const googleIdentities = decodedToken.firebase?.identities?.["google.com"];

        if (provider !== "google.com" && (!Array.isArray(googleIdentities) || googleIdentities.length === 0)) {
            throw new BadRequestException("Token was not issued from a Google sign-in.");
        }

        return decodedToken;
    }

    private getFirebaseApp(): App {
        const existingApps = getApps();
        if (existingApps.length > 0) {
            return existingApps[0];
        }

        if (this.firebaseConfig.serviceAccountJson) {
            const serviceAccount = JSON.parse(this.firebaseConfig.serviceAccountJson) as ServiceAccount;
            return initializeApp({ credential: cert(serviceAccount) });
        }

        if (this.firebaseConfig.serviceAccountPath) {
            const absolutePath = path.resolve(process.cwd(), this.firebaseConfig.serviceAccountPath);

            if (!fs.existsSync(absolutePath)) {
                throw new Error(`Firebase service account file not found at: ${absolutePath}`);
            }

            return initializeApp({ credential: cert(absolutePath) });
        }

        if (this.firebaseConfig.firebase_secrets) {
            try {
                const serviceAccount = JSON.parse(this.firebaseConfig.firebase_secrets) as ServiceAccount;
                return initializeApp({ credential: cert(serviceAccount) });
            } catch {
                const legacyPath = path.resolve(process.cwd(), "src/modules/notification/providers/softball-american.json");

                if (!fs.existsSync(legacyPath)) {
                    throw new Error("Legacy Firebase configuration file not found");
                }

                return initializeApp({ credential: cert(legacyPath) });
            }
        }

        return initializeApp();
    }

    private getGoogleSubject(decodedToken: DecodedIdToken) {
        const googleIdentities = decodedToken.firebase?.identities?.["google.com"];
        return Array.isArray(googleIdentities) ? googleIdentities[0] : undefined;
    }

    private async resolveGoogleNickName(requestedNickName: string | undefined, email: string, name?: string) {
        if (requestedNickName) {
            await this.assertNickNameAvailable(requestedNickName);
            return requestedNickName;
        }

        const baseNickName = this.normalizeNickName(name || email.split("@")[0]);

        for (let attempt = 0; attempt < 10; attempt++) {
            const candidate = attempt === 0
                ? baseNickName
                : `${baseNickName.slice(0, 24)}${Math.floor(100000 + Math.random() * 900000)}`;

            const existingNickName = await this.prismaService.user.findUnique({
                where: { nick_name: candidate },
            });

            if (!existingNickName) {
                return candidate;
            }
        }

        return `${baseNickName.slice(0, 20)}${Date.now().toString().slice(-8)}`;
    }

    private normalizeNickName(value: string) {
        const normalized = value
            .toLowerCase()
            .replace(/[^a-z0-9_]+/g, "_")
            .replace(/^_+|_+$/g, "")
            .slice(0, 30);

        return normalized.length >= 3 ? normalized : `user_${normalized || "google"}`;
    }

    /**
     * Get authenticated user details
     * @param userId 
     * @returns 
     */
    async getAuthenticatedUser(userId: string) {
        const userDetails = await this.userService.findUserById(userId);
        const ratingInfo = await this.ratingService.getAverageRatingForUser(userId);

        return {
            ...userDetails,
            rating: ratingInfo.averageRating,
            totalRating: ratingInfo.totalRatings,
            totalRatings: ratingInfo.totalRatings
        };
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
    async resendEmailVerificationCode(email: string) {
        const user = await this.userService.findUserByEmail(email)

        if (!user) {
            throw new NotFoundException("user not found")
        }
        await this.sendEmailVerificationCode(user.id, user.name || "User", user.email)

        return { message: "email verification code resent successfully" }
    }

    /**
     * 
     * @param name 
     * @param email 
     */

    private async sendEmailVerificationCode(userId: string, name: string, email: string) {

        const code = this.generateEmailVerificationCode()
        const expirationTime = new Date(Date.now() + 10 * 60 * 1000)
        this.prismaService.user.update({ where: { id: userId }, data: { otp: code, otp_expires: expirationTime } })
        const emailTemplate = ({ name, verificationCode: code, verificationCodeExpire: 10 })

        this.smtpProvider.sendMail(email, "Email Verification code", otpEmailTemplate({ name, otp: code }))
    }

    /**
    * 
    * @returns 
    */

    private generateEmailVerificationCode() {

        return Math.round(100000 + Math.random() * 900000).toString()
    }
}
