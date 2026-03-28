import { BadRequestException, CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Request } from "express";
import { TokenPayload } from "../types/TokenPayload.type";
import { Reflector } from "@nestjs/core";
import { PUBLIC_KEY } from "src/common/decorators/public.decorator";
import { UserService } from "src/modules/user/user.service";
import { type ConfigType } from "@nestjs/config";
import jwtConfig from "src/config/jwt.config";

@Injectable()
export class JwtGuard implements CanActivate {

    constructor(private readonly jwtService: JwtService,
        private readonly reflector: Reflector,
        private readonly userService: UserService,
        @Inject(jwtConfig.KEY)
        private readonly jwtConfigOptions: ConfigType<typeof jwtConfig>
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<Request>()

        const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [context.getHandler(), context.getClass()]);

        if (isPublic) {
            return true
        }

        try {
            const token = this.extractToken(request)

            const payload = await this.jwtService.verifyAsync<TokenPayload>(token, {
                secret: this.jwtConfigOptions.jwt_secret
            })

            const user = await this.getUserData(payload.id);

            if (!user) {
                throw new BadRequestException("User data does not exist");
            }
            

            if(user.is_blocked){
                throw new BadRequestException('Sorry, your are blocked by the admin.Kindly, Contact support.Thanks')
            }

            if(user.is_deleted){
                throw new BadRequestException('Sorry, your account has been deleted. If you think this is a mistake, please contact support. Thanks')
            }

            request['payload'] = payload;

            return true

        } catch (err) {
            throw err
        }

    }

    private extractToken(request: Request) {

        if (!request.headers.authorization) {
            throw new BadRequestException("authorization header missing")
        }
        const [type, token] = request.headers.authorization?.split(" ") || []

        if (type !== "Bearer")
            throw new UnauthorizedException("token type is not valid")
        if (!token) {
            throw new UnauthorizedException("token is missing")
        }

        return token
    }
    private async getUserData(userId: string) {
        const user = await this.userService.findUserById(userId)
        return user
    }

}