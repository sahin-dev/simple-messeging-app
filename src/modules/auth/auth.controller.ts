import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, Req } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { SigninDto } from "./dtos/signin.dto";
import { RegisterUserDto } from "./dtos/register-user.dto";
import { ResponseMessage } from "src/common/decorators/apiResponseMessage.decorator";
import { plainToInstance } from "class-transformer";
import { SignInResponseDto } from "./dtos/sign-in-response.dto";
import { Public } from "src/common/decorators/public.decorator";
import { TokenPayload } from "./types/TokenPayload.type";
import { UserResponseDto } from "../user/dtos/user-response.dto";
import { AdminSigninDto } from "./dtos/admin-signin.dto";
import { UserRole } from "generated/prisma/enums";
import { GoogleSigninDto } from "./dtos/google-signin.dto";
import { CheckAuthAvailabilityDto } from "./dtos/check-auth-availability.dto";
import { AppleSigninDto } from "./dtos/apple-signin.dto";
import { GoogleAuthStatusDto } from "./dtos/google-auth-status.dto";

@Controller({
    path: "auth"
})
export class AuthController {

    constructor(private readonly authService: AuthService) { }

    @Post("signin")
    @Public()
    @ResponseMessage("user signed in")
    @HttpCode(HttpStatus.OK)
    async signinUser(@Body() signinDto: SigninDto) {
        const user = await this.authService.signin(signinDto);

        if (user.role === UserRole.USER) {

            return plainToInstance(SignInResponseDto, user, {
                excludeExtraneousValues: true,
                groups: [UserRole.USER]
            });
        }

        return plainToInstance(SignInResponseDto, user, {
            excludeExtraneousValues: true,
            groups: [UserRole.ADMIN]
        });

    }


    @Post("register")
    @Public()
    @ResponseMessage("User registered successfully")
    async registerUser(@Body() registerDto: RegisterUserDto) {
        const user = await this.authService.registerUser(registerDto);

        if (user.role === UserRole.USER) {
            return plainToInstance(SignInResponseDto, user, {
                excludeExtraneousValues: true,
                groups: [UserRole.USER]
            });
        }

        return plainToInstance(SignInResponseDto, user, {
            excludeExtraneousValues: true,
            groups: [UserRole.ADMIN]
        });
    }

    @Post("google")
    @Public()
    @ResponseMessage("User signed in with Google successfully")
    @HttpCode(HttpStatus.OK)
    async googleSignin(@Body() googleSigninDto: GoogleSigninDto) {
        const user = await this.authService.googleSignin(googleSigninDto);

        if (user.role === UserRole.USER) {
            return plainToInstance(SignInResponseDto, user, {
                excludeExtraneousValues: true,
                groups: [UserRole.USER]
            });
        }

        return plainToInstance(SignInResponseDto, user, {
            excludeExtraneousValues: true,
            groups: [UserRole.ADMIN]
        });
    }

    @Post("google/status")
    @Public()
    @ResponseMessage("Google account registration status checked successfully")
    @HttpCode(HttpStatus.OK)
    async getGoogleAuthStatus(@Body() googleAuthStatusDto: GoogleAuthStatusDto) {
        return this.authService.getGoogleAuthStatus(googleAuthStatusDto);
    }

     @Post("apple")
    @Public()
    @ResponseMessage("User signed in with Apple successfully")
    @HttpCode(HttpStatus.OK)
    async appleSignin(@Body() appleSigninDto: AppleSigninDto) {
        const user = await this.authService.appleSignin(appleSigninDto);
                
        if (user.role === UserRole.USER) {
            return plainToInstance(SignInResponseDto, user, {
                excludeExtraneousValues: true,
                groups: [UserRole.USER]
            });
        }

        return plainToInstance(SignInResponseDto, user, {
            excludeExtraneousValues: true,
            groups: [UserRole.ADMIN]
        });
    }

    @Get("availability")
    @Public()
    @ResponseMessage("Auth fields availability checked successfully")
    async checkAvailability(@Query() checkAvailabilityDto: CheckAuthAvailabilityDto) {
        return this.authService.checkAvailability(checkAvailabilityDto);
    }

    @Get("me")
    @ResponseMessage("User details fetched successfully")
    async getAuthenticatedUser(@Req() request: Request) {
        const tokenpayload = request["payload"] as TokenPayload;

        const userDetails = await this.authService.getAuthenticatedUser(tokenpayload.id);

        if (userDetails?.role === UserRole.USER) {
            return plainToInstance(UserResponseDto, userDetails, {
                excludeExtraneousValues: true,
                groups: [UserRole.USER]
            });
        }

        return plainToInstance(UserResponseDto, userDetails, {
            excludeExtraneousValues: true,
            groups: [UserRole.ADMIN]
        });
    }
}
