import { Body, Controller, Delete, Get, Patch, Post, Query, Req, UploadedFile, UseInterceptors } from "@nestjs/common";
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
}