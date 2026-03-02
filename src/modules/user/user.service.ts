import { BadRequestException, forwardRef, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateUserDto } from "./dtos/create-user.dto";
import { EncoderProvider } from "src/common/providres/encoder.provider";
import { UpdateUserDto } from "./dtos/update-user.dto";
import { User, UserRole } from "generated/prisma/client";
import { ChangePasswordDto } from "./dtos/change-password.dto";
import { SMTPProvider } from "src/common/providres/smtp.provider";
import * as fs from "fs";
import { ChatService } from "../chat/chat.service";
import { PaginationDto } from "src/common/dtos/pagination.dto";
import { SocketGateway } from "../chat/gateway/chat.gateway";

@Injectable()
export class UserService {

    constructor(
        private readonly prismaService: PrismaService,
        private readonly encoder: EncoderProvider,
        private readonly smtpProvider: SMTPProvider,
        private readonly chatService: ChatService,
    ) { }

    /**
     * Create a new user
     * @param createUserDto 
     * @returns 
     */
    async addUser(createUserDto: CreateUserDto) {
        const hashedPassword = await this.encoder.hashPassword(createUserDto.password, 10);
        const user = await this.prismaService.user.create({
            data: {
                ...createUserDto,
                password: hashedPassword,
                is_more_options_accepted:createUserDto.is_more_options_accepted
            }
        });

        return user;
    }

    async getAllUsers(page: number, limit: number) {
        const skip = (page - 1) * limit
        const totalUsers = await this.prismaService.user.count({ where: { role: UserRole.USER } });
        const users = await this.prismaService.user.findMany({ where: { role: UserRole.USER }, skip, take: limit, omit: { password: true, otp: true, otp_expires: true, otp_verification_token: true }, orderBy: { createdAt: "desc" } });
        return { users, totalUsers };
    }

    /**
     * Find user by ID
     * @param userId 
     * @returns 
     */
    async findUserById(userId: string) {
        const user = await this.prismaService.user.findUnique({ where: { id: userId } });
        return user;
    }

    /**
     * Find user by licence_id or nick_name or email
     * @param identifier 
     * @returns 
     */
    async findUserByIdentifier(identifier: string) {
        const user = await this.prismaService.user.findFirst({
            where: {
                OR: [
                    { licence_id: identifier },
                    { nick_name: identifier },
                    { email: identifier }
                ]
            }
        });

        return user;
    }

    async findAdminByEmail(email: string) {
        const user = await this.prismaService.user.findFirst({
            where: {
                email,
                role: UserRole.ADMIN
            }
        });

        return user;
    }

    /**
     * Search users by nick_name or licence_id
     * @param query 
     * @returns 
     */
    async searchUsers(userId: string, query: string, page: number, limit: number) {

        const totalUsers = await this.prismaService.user.count({
            where: {
                NOT:{is_blocked:true},
                role: { not: UserRole.ADMIN },
                blockListsBy: {
                    none: {
                        user_id: userId
                    }
                },
                blockLists: {
                    none: {
                        blocked_user_id: userId
                    }
                },

                id: {
                    not: userId
                },

                OR: [
                    { nick_name: { contains: query, mode: "insensitive" } },
                    { licence_id: { contains: query, mode: "insensitive" } }
                ],

            },
        });

        const users = await this.prismaService.user.findMany({
            where: {
                NOT:{is_blocked:true},
                blockListsBy: {
                    none: {
                        user_id: userId
                    }
                },
                blockLists: {
                    none: {
                        blocked_user_id: userId
                    }
                },

                id: {
                    not: userId
                },
                OR: [
                    { nick_name: { contains: query, mode: "insensitive" } },
                    { licence_id: { contains: query, mode: "insensitive" } }
                ],

            },
            take: limit,
            skip: (page - 1) * limit,
            omit: { password: true, otp: true, otp_expires: true, otp_verification_token: true, name: true, email: true }
        });

        const mappedUsers = users.map(async user => {

            const existingRoom = await this.chatService.getChatRoomIfExist(userId, user.id)

            return {
                ...user,
                existingRoom,
            }
        })

        const awaitedusers = await Promise.all(mappedUsers)


        return { users:awaitedusers, totalUsers };
    }

    /**
     * Get previously messaged users for a user
     * @param userId 
     * @returns 
     */
    async getPreviouslyMessagedUsers(userId: string, page: number, limit: number) {

        const skip = (page - 1) * limit

        const totalChatRooms = await this.prismaService.chatRoom.count({
            where: {
                OR: [
                    { user1_id: userId },
                    { user2_id: userId }
                ]
            }
        });

        const chatRooms = await this.prismaService.chatRoom.findMany({
            where: {
                OR: [
                    { user1_id: userId },
                    { user2_id: userId }
                ]
            },
            include: {
                user1: {
                    select: {
                        id: true,
                        nick_name: true,
                        licence_id: true,
                        avatar: true
                    }
                },
                user2: {
                    select: {
                        id: true,
                        nick_name: true,
                        licence_id: true,
                        avatar: true
                    }
                },
                chats: {
                    orderBy: { createdAt: "desc" },
                    take: 1,
                    select: {
                        message: true,
                        createdAt: true,
                        is_read: true,
                        sender_id: true
                    }
                }
            },
            orderBy: {
                updatedAt: "desc"
            },
            skip,
            take: limit
        });

        // Map to get the other user in each chat room
        const previouslyMessagedUsers = await Promise.all(chatRooms.map(async room => {
            const otherUser = room.user1_id === userId ? room.user2 : room.user1;
            const lastMessage = room.chats[0];

            const blockStatus = await this.checkBlockStatus(userId, otherUser.id)
            const isBlockedByMe = blockStatus?.user_id === userId
            const isBLockedMe = blockStatus?.blocked_user_id === otherUser.id

            return {
                ...otherUser,
                lastMessage: lastMessage ? {
                    message: lastMessage.message,
                    createdAt: lastMessage.createdAt,
                    is_read: lastMessage.is_read,
                    is_mine: lastMessage.sender_id === userId
                } : null,
                isBlockedByMe,
                isBLockedMe
            };
        }));


        return { previouslyMessagedUsers, totalChatRooms };
    }

    /**
     * Update user profile
     * @param userId 
     * @param updateUserDto 
     * @param file 
     * @returns 
     */
    async updateUser(userId: string, updateUserDto: UpdateUserDto, file?: Express.Multer.File) {
        const user = await this.prismaService.user.findUnique({ where: { id: userId } });

        if (!user) {
            throw new NotFoundException("User not found");
        }

        if (file) {
            if (user.avatar) {
                this.deletePreviousAvatar(user.avatar);
            }
        }

        const updatedData: Partial<User> = {
            nick_name: updateUserDto.nick_name ?? user.nick_name,
            name: updateUserDto.name ?? user.name,
            avatar: (file && file.path) ?? user.avatar
        };

        const updatedUser = await this.prismaService.user.update({
            where: { id: user.id },
            data: updatedData
        });

        return updatedUser;
    }

    async deletePreviousAvatar(avatar: string) {

        try {
            if (avatar) {
                fs.unlinkSync(avatar);

                console.log("Old avatar deleted successfully")
            }
        } catch (error) {
            console.log(error);
        }
    }

    /**
     * Change password
     * @param userId 
     * @param changePasswordDto 
     * @returns 
     */
    async changePassword(userId: string, changePasswordDto: ChangePasswordDto) {
        const user = await this.prismaService.user.findUnique({ where: { id: userId } });

        if (!user) {
            throw new NotFoundException("User not found");
        }

        if (changePasswordDto.newPassword !== changePasswordDto.confirmPassword) {
            throw new BadRequestException("New password and confirm password do not match");
        }

        const passwordMatched = await this.encoder.compare(changePasswordDto.currentPassword, user.password);

        if (!passwordMatched) {
            throw new BadRequestException("Incorrect current password");
        }

        const samePasswordCheck = await this.encoder.compare(changePasswordDto.newPassword, user.password);

        if (samePasswordCheck) {
            throw new BadRequestException("You recently used this password");
        }

        const hashedPassword = await this.encoder.hashPassword(changePasswordDto.newPassword, 10);

        const updatedUser = await this.prismaService.user.update({
            where: { id: user.id },
            data: { password: hashedPassword }
        });

        return updatedUser;
    }

    async forgetPassword(email: string) {
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
            "OTP for password reset",
            `Your OTP is: ${otp}`
        );

        return { message: "OTP sent successfully" };
    }


    async verifyOtp(email: string, otp: string) {
        const user = await this.prismaService.user.findFirst({ where: { email } });

        if (!user) {
            throw new NotFoundException("User not found");
        }

        if (user.otp && user.otp !== otp) {
            throw new BadRequestException("Invalid OTP");
        }

        if (user.otp_expires && user.otp_expires < new Date()) {
            throw new BadRequestException("OTP expired");
        }

        const otpVerificationToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

        await this.prismaService.user.update({
            where: { id: user.id },
            data: { otp: null, otp_expires: null, otp_verification_token: otpVerificationToken }
        });

        return { message: "OTP verified successfully", otp_verification_token: otpVerificationToken };
    }

    async resetPassword(email: string, password: string, token: string) {
        const user = await this.prismaService.user.findFirst({ where: { email } });

        if (!user) {
            throw new NotFoundException("User not found");
        }

        if (user.otp_verification_token && user.otp_verification_token !== token) {
            throw new BadRequestException("Invalid token");
        }

        const hashedPassword = await this.encoder.hashPassword(password, 10);

        await this.prismaService.user.update({
            where: { id: user.id },
            data: { password: hashedPassword, otp_verification_token: null }
        });

        return { message: "Password reset successfully" };
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
            "OTP for password reset",
            `Your OTP is: ${otp}`
        );

        return { message: "OTP sent successfully" };
    }

    async blockUnblockAccountByAdmin(userId:string){
        const user = await this.prismaService.user.findUnique({where:{id:userId}})

        if(!user){
            throw new BadRequestException("User not found!")
        }

        const updatedUser = await this.prismaService.user.update({where:{id:user.id}, data:{is_blocked:!user.is_blocked}})

        return updatedUser
    }

    async blockUser(blockedUserId: string, userId: string) {


        const user = await this.prismaService.user.findUnique({ where: { id: userId } });

        if (!user) {
            throw new NotFoundException("User not found");
        }

        console.log(userId)
        console.log(blockedUserId)

        if (user.id === blockedUserId) {
            throw new BadRequestException("You cannot block yourself");
        }

        const isBlocked = await this.checkBlockStatus(user.id, blockedUserId);

        if (isBlocked) {
            throw new BadRequestException("You have already blocked this user");
        }

        const blockList = await this.prismaService.blockList.create({
            data: {
                user_id: user.id,
                blocked_user_id: blockedUserId
            }
        });

        return blockList;
    }

    async unblockUser(blockedUserId: string, userId: string) {
        const user = await this.prismaService.user.findUnique({ where: { id: userId } });

        if (!user) {
            throw new NotFoundException("User not found");
        }

        const blockList = await this.prismaService.blockList.delete({
            where: {
                user_id_blocked_user_id: {
                    user_id: user.id,
                    blocked_user_id: blockedUserId
                }
            }
        });

        return blockList;
    }


    async getBlockedUsers(userId: string, pagination: PaginationDto) {
        const { page, limit } = pagination;
        const skip = (page - 1) * limit;

        const user = await this.prismaService.user.findUnique({ where: { id: userId } });

        if (!user) {
            throw new NotFoundException("User not found");
        }

        const blockList = await this.prismaService.blockList.findMany({
            skip,
            take: limit,
            where: {
                user_id: user.id
            },
            include:{
                blocked_user:{select:{id:true, nick_name:true, avatar:true}},
            }
        });

        const totalBlockedUsers = await this.prismaService.blockList.count({
            where: {
                user_id: user.id
            }
        });

        return {
            blockList,
            totalBlockedUsers
        };
    }

    async checkBlockStatus(userId: string, blockedUserId: string) {
        const user = await this.prismaService.user.findUnique({ where: { id: userId } });

        if (!user) {
            throw new NotFoundException("User not found");
        }

        const blockList = await this.prismaService.blockList.findUnique({
            where: {
                user_id_blocked_user_id: {
                    user_id: user.id,
                    blocked_user_id: blockedUserId
                }
            }
        });

        return blockList;
    }
}




