import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, Res, UploadedFile, UseInterceptors } from "@nestjs/common";
import { UserService } from "./user.service";
import { plainToInstance } from "class-transformer";
import { UserResponseDto } from "./dtos/user-response.dto";
import { UpdateUserDto } from "./dtos/update-user.dto";
import { TokenPayload } from "../auth/types/TokenPayload.type";
import { ResponseMessage } from "src/common/decorators/apiResponseMessage.decorator";
import { ChangePasswordDto } from "./dtos/change-password.dto";
import { FileInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { randomUUID } from "crypto";
import { SearchUsersDto } from "./dtos/search-users.dto";
import { PaginationDto } from "src/common/dtos/pagination.dto";
import { ResetPasswordDto } from "./dtos/reset-password.dto";
import { VerifyOtpDto } from "./dtos/verify-otp.dto";
import { ForgetPasswordDto } from "./dtos/forget-password.dto";
import { Public } from "src/common/decorators/public.decorator";
import { UserRole } from "generated/prisma/enums";
import { Roles } from "src/common/decorators/role.decorator";
import { BlockUnblockDto } from "./dtos/block-unblock.dto";
import { TogggleBlockUserDto } from "./dtos/block-user.dto";
import { DeleteAccountDto } from "./dtos/delete-account.dto";
import { ScanQrCodeDto } from "./dtos/scan-qr-code.dto";
import { UpdateUserLocationDto } from "./dtos/update-user-location.dto";
import { VerifyLicenseDto } from "./dtos/verify-license.dto";


@Controller({
    path: "users",
})
export class UserController {

    constructor(private readonly userService: UserService) { }

    /**
     * Search users by nick_name or licence_id
     */
    @Get("search")
    @ResponseMessage("Users found successfully")
    async searchUsers(@Query() searchDto: SearchUsersDto, @Req() req: Request) {

        const tokenPayload = req['payload'] as TokenPayload;

        if (searchDto.for === "group" || searchDto.roomId){
            const paginationDto = new PaginationDto();
            paginationDto.page = searchDto.page;
            paginationDto.limit = searchDto.limit;
            const users = await this.userService.searchUsersToAddToGroup(searchDto.roomId!, tokenPayload.id,searchDto.query, paginationDto);
                return users.users.map(user => plainToInstance(UserResponseDto, user, {
                excludeExtraneousValues: true,
                groups: [UserRole.USER]
            }))

        }

        const users = await this.userService.searchUsers(tokenPayload.id, searchDto.query, searchDto.page, searchDto.limit);
        return users;
    }

    /**
     * Get previously messaged users
     */
    @Get("previously-messaged")
    @ResponseMessage("Previously messaged users fetched successfully")
    async getPreviouslyMessagedUsers(@Req() request: Request, @Query() paginationDto: PaginationDto) {
        const tokenPayload = request['payload'] as TokenPayload;
        const users = await this.userService.getPreviouslyMessagedUsers(tokenPayload.id, paginationDto.page, paginationDto.limit);
        return users;
    }

    /**
     * Update user profile
     */
    @UseInterceptors(FileInterceptor("avatar", {
        limits: { files: 1 },
        storage: diskStorage({
            destination: "./uploads/users",
            filename: (req, file, cb) => {
                const uuid = randomUUID().toString();
                const [_, ext] = file.originalname.split(".");
                cb(null, `avatar_${uuid}.${ext}`);
            }
        })
    }))
    @Patch()
    @ResponseMessage("User updated successfully")
    async updateUser(@Req() request: Request, @Body() updateUserDto: UpdateUserDto, @UploadedFile() file?: Express.Multer.File) {
        const tokenPayload = request['payload'] as TokenPayload;
        console.log(updateUserDto)
        const updatedResult = await this.userService.updateUser(tokenPayload.id, updateUserDto, file);

        return plainToInstance(UserResponseDto, updatedResult, {
            excludeExtraneousValues: true,
            groups: [UserRole.ADMIN, UserRole.USER]
        });
    }

    /**
     * Change password
     */
    @Patch("change-password")
    @ResponseMessage("Password updated successfully")
    async changePassword(@Req() request: Request, @Body() changePasswordDto: ChangePasswordDto) {
        const tokenPayload = request['payload'] as TokenPayload;
        const changePasswordResult = await this.userService.changePassword(tokenPayload.id, changePasswordDto);

        return plainToInstance(UserResponseDto, changePasswordResult, {
            excludeExtraneousValues: true,
            groups: [UserRole.ADMIN, UserRole.USER]
        });
    }

    @Post("forget-password")
    @ResponseMessage("OTP sent successfully")
    @Public()
    async forgetPassword(@Body() forgetPasswordDto: ForgetPasswordDto) {
        const forgetPasswordResult = await this.userService.forgetPassword(forgetPasswordDto.email);
        return forgetPasswordResult;
    }

    @Post("verify-otp")
    @ResponseMessage("OTP verified successfully")
    @Public()
    async verifyOtp(@Body() verifyOtpDto: VerifyOtpDto) {
        const verifiedResult = await this.userService.verifyOtp(verifyOtpDto.email, verifyOtpDto.otp);
        return verifiedResult;
    }

    @Post("reset-password")
    @ResponseMessage("Password reset successfully")
    @Public()
    async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
        const resetPasswordResult = await this.userService.resetPassword(resetPasswordDto.email, resetPasswordDto.password, resetPasswordDto.token);
        return resetPasswordResult;
    }

    @Get()
    @ResponseMessage("Users fetched successfully")
    async getAllUsers(@Query() paginationDto: PaginationDto) {
        const allUsers = await this.userService.getAllUsers(paginationDto.page, paginationDto.limit);
        return allUsers;
    }

    @Patch("toggole-block")
    @ResponseMessage("User block status updated")
    @Roles(UserRole.ADMIN)
    async blockUnblockAccount( @Body()blockUnblockDto:BlockUnblockDto){

        const updatedUser = await this.userService.blockUnblockAccountByAdmin(blockUnblockDto.userId)

        return plainToInstance(UserResponseDto, updatedUser, {
            excludeExtraneousValues:true,
            groups:[UserRole.ADMIN]
        })
    }

    @Patch("block")
    async blockUser (@Req() request:Request, @Body() toggleBlockuser:TogggleBlockUserDto){
            const payload = request['payload'] as TokenPayload

            const updatedUser = await this.userService.blockUser(toggleBlockuser.userId, payload.id)

            return updatedUser
    }

    @Get("block-list")
    async getUserBlockList(@Req() request:Request, @Query()pagination:PaginationDto){

        const payload=  request['payload'] as TokenPayload

        const blockList = await this.userService.getBlockedUsers(payload.id, pagination)

        return blockList
    }

    @Patch("unblock")
    async unBlockUser (@Req() request:Request, @Body() toggleBlockuser:TogggleBlockUserDto){
            const payload = request['payload'] as TokenPayload

            const updatedUser = await this.userService.unblockUser(toggleBlockuser.userId, payload.id)

            return updatedUser
    }

    @Delete()
    async deleteAccount(@Req() request:Request, @Body() deleteAccountDto:DeleteAccountDto){
        const payload = request['payload'] as TokenPayload;
        await this.userService.deleteAccount(payload.id, deleteAccountDto.password);
        return { message: "Account deleted successfully" };
    }

    @Get("help-support")
    async helpSupport(){
        const helpMessage = await this.userService.helpAndSupport();
        return { message: helpMessage };
    }

    @Get("generate-code")
    async getQrCodeForUser(@Req() request:Request){
        const payload = request['payload'] as TokenPayload;
        const qrcode = await this.userService.generateQrCodeForUser(payload.id)
        return { qr_code: qrcode }
    }

    @Get("qr-card")
    async getQrCard(@Req() request: Request, @Res() res: any) {
        const payload = request['payload'] as TokenPayload;
        const user = await this.userService.findUserById(payload.id);
        if (!user) {
            res.status(444).send("User not found");
            return;
        }
        const qrcode = await this.userService.generateQrCodeForUser(payload.id);

        const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>PLATEChatter QR Card - ${user.nick_name}</title>
            <style>
                body {
                    font-family: 'Outfit', 'Inter', sans-serif;
                    background-color: #f3f4f6;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                    margin: 0;
                }
                .card {
                    background: white;
                    border-radius: 20px;
                    box-shadow: 0 10px 25px rgba(0,0,0,0.1);
                    padding: 40px;
                    text-align: center;
                    width: 320px;
                    border: 1px solid #e5e7eb;
                    position: relative;
                }
                .logo-container {
                    margin-bottom: 25px;
                }
                .logo {
                    font-size: 24px;
                    font-weight: 800;
                    color: #4F46E5;
                    letter-spacing: -0.05em;
                }
                .logo span {
                    color: #111827;
                }
                .qr-image {
                    width: 200px;
                    height: 200px;
                    margin: 0 auto 25px auto;
                    display: block;
                    border: 1px solid #f3f4f6;
                    border-radius: 12px;
                    padding: 10px;
                    background: #fff;
                }
                .username {
                    font-size: 20px;
                    font-weight: 700;
                    color: #111827;
                    margin: 0 0 5px 0;
                }
                .license-plate {
                    font-size: 14px;
                    color: #6b7280;
                    font-weight: 500;
                    letter-spacing: 0.05em;
                    text-transform: uppercase;
                }
                .print-btn {
                    margin-top: 30px;
                    background-color: #4F46E5;
                    color: white;
                    border: none;
                    padding: 12px 24px;
                    font-size: 14px;
                    font-weight: 600;
                    border-radius: 8px;
                    cursor: pointer;
                    transition: background-color 0.2s;
                }
                .print-btn:hover {
                    background-color: #4338CA;
                }
                @media print {
                    body {
                        background-color: white;
                    }
                    .card {
                        box-shadow: none;
                        border: none;
                    }
                    .print-btn {
                        display: none;
                    }
                }
            </style>
        </head>
        <body>
            <div class="card">
                <div class="logo-container">
                    <div class="logo">PLATE<span>Chatter</span></div>
                </div>
                <img class="qr-image" src="${qrcode}" alt="QR Code" />
                <div class="username">@${user.nick_name}</div>
                <div class="license-plate">Plate: ${user.licence_id || 'N/A'}</div>
                <button class="print-btn" onclick="window.print()">Print Card</button>
            </div>
        </body>
        </html>
        `;
        res.setHeader('Content-Type', 'text/html');
        res.send(htmlContent);
    }

    @Post("scan-qr-code")
    @ResponseMessage("User info fetched successfully")
    async scanQrCode(@Req() request:Request, @Body() scanQrCodeDto: ScanQrCodeDto){
        const payload = request['payload'] as TokenPayload;
        const userInfo = await this.userService.getUserInfoFromQrCode(payload.id, scanQrCodeDto.qrData)
        return userInfo;
    }

    /**
     * Get user profile with rating
     */
    @Get(":id/profile")
    @ResponseMessage("User profile fetched successfully")
    async getUserProfile(@Param('id') userId: string) {
        const userProfile = await this.userService.getUserProfile(userId);
        return userProfile;
    }

    /**
     * Update user location
     */
    @Post("location")
    @ResponseMessage("User location updated successfully")
    async updateUserLocation(@Req() request: Request, @Body() updateUserLocationDto: UpdateUserLocationDto) {
        const tokenPayload = request['payload'] as TokenPayload;
        const updatedLocation = await this.userService.updateUserLocation(
            tokenPayload.id,
            updateUserLocationDto.latitude,
            updateUserLocationDto.longitude,
            updateUserLocationDto.accuracy
        );
        return updatedLocation;
    }

    /**
     * Verify user license plate number
     */
    @Post("verify-license")
    @ResponseMessage("License verified successfully")
    async verifyUserLicense(@Req() request: Request, @Body() verifyLicenseDto: VerifyLicenseDto) {
        const tokenPayload = request['payload'] as TokenPayload;
        const updatedUser = await this.userService.verifyUserLicense(
            tokenPayload.id,
            verifyLicenseDto.plate_no
        );
        return plainToInstance(UserResponseDto, updatedUser, {
            excludeExtraneousValues: true,
            groups: [UserRole.ADMIN, UserRole.USER],
        });
    }
}