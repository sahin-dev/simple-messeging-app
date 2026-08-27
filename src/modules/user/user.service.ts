import { BadRequestException, forwardRef, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateUserDto } from "./dtos/create-user.dto";
import { EncoderProvider } from "src/common/providres/encoder.provider";
import { UpdateUserDto } from "./dtos/update-user.dto";
import { AddVehicleInfoDto } from "./dtos/add-vehicle-info.dto";
import { UpdateVehicleInfoDto } from "./dtos/update-vehicle-info.dto";
import { User, UserRole } from "generated/prisma/client";
import { ChangePasswordDto } from "./dtos/change-password.dto";
import { SMTPProvider } from "src/common/providres/smtp.provider";
import * as fs from "fs";
import { ChatService } from "../chat/chat.service";
import { PaginationDto } from "src/common/dtos/pagination.dto";
import { SocketGateway } from "../chat/gateway/chat.gateway";
import otpEmailTemplate from "src/common/templates/emailVerification.template";
import { QrCodeGeneratorProvider } from "./providers/qrCodeGenerator.provider";
import { RatingService } from "../rating/rating.service";
import { UserWhereInput } from "generated/prisma/models";
import { SocketRoomService } from "../chat/services/socket-room.service";

@Injectable()
export class UserService {

    constructor(
        private readonly prismaService: PrismaService,
        private readonly encoder: EncoderProvider,
        private readonly smtpProvider: SMTPProvider,
        private readonly chatService: ChatService,
        private readonly qrCodeGenerator: QrCodeGeneratorProvider,
        private readonly ratingService: RatingService,
        @Inject('SOCKET_ROOM_SERVICE')
        private readonly socketRoomService: SocketRoomService,
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

    async updateLastSeenAt(userId: string, lastSeenAt = new Date()) {
        return this.prismaService.user.update({
            where: { id: userId },
            data: { lastSeenAt },
            select: { id: true, lastSeenAt: true },
        });
    }

    /**
     * Find user by licence_id or nick_name or email
     * @param identifier 
     * @returns 
     */
    async findUserByIdentifier(identifier: string) {
        const user = await this.prismaService.user.findFirst({
            where: {
                licence_id: identifier,
                is_deleted: false
            }
        });

        if(!user){
            const userByNickName = await this.prismaService.user.findFirst({
                where:{
                    OR:[
                        {nick_name:identifier},
                        {email:identifier}
                    ]
                }
            })
           
            return userByNickName
        }

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
        const declinedRequests = await this.prismaService.messageRequest.findMany({
            where: {
                senderId: userId,
                status: 'DECLINED',
            },
            select: {
                receiverId: true,
            },
        });
        const declinedReceiverIds = declinedRequests.map((request) => request.receiverId);

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
                    notIn: [userId, ...declinedReceiverIds],
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
                    notIn: [userId, ...declinedReceiverIds],
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

        const receiverIds = users.map((user) => user.id);
        const sentMessageRequests = await this.prismaService.messageRequest.findMany({
            where: {
                senderId: userId,
                receiverId: { in: receiverIds },
            },
            orderBy: { createdAt: 'desc' },
        });
        const messageRequestByReceiverId = new Map(
            sentMessageRequests.map((request) => [request.receiverId, request])
        );
        const presenceByUserId = this.socketRoomService.getPresenceMap(users);

        const mappedUsers = users.map(async user => {

            const existingRoom = await this.chatService.getChatRoomIfExist(userId, user.id)
            const messageRequest = messageRequestByReceiverId.get(user.id) ?? null
            const presence = presenceByUserId.get(user.id)

            return {
                ...user,
                isOnline: presence?.isOnline ?? false,
                lastSeenAt: presence?.lastSeenAt ?? user.lastSeenAt ?? null,
                existingRoom,
                isMessageRequestSent: Boolean(messageRequest),
                messageRequest: messageRequest ? {
                    id: messageRequest.id,
                    status: messageRequest.status,
                    receiverId: messageRequest.receiverId,
                    roomId: messageRequest.roomId,
                    firstMessage: messageRequest.firstMessage,
                    presetMessageId: messageRequest.presetMessageId,
                    createdAt: messageRequest.createdAt,
                    updatedAt: messageRequest.updatedAt,
                } : null,
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
                        avatar: true,
                        lastSeenAt: true
                    }
                },
                user2: {
                    select: {
                        id: true,
                        nick_name: true,
                        licence_id: true,
                        avatar: true,
                        lastSeenAt: true
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
                ...this.buildPresenceFields(otherUser),
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

    async getUsersPresence(userIds: string[]) {
        const uniqueUserIds = [...new Set(userIds.filter(Boolean))];
        const users = await this.prismaService.user.findMany({
            where: { id: { in: uniqueUserIds } },
            select: { id: true, lastSeenAt: true },
        });
        const presenceByUserId = this.socketRoomService.getPresenceMap(users);

        return {
            users: uniqueUserIds.map((userId) => {
                const presence = presenceByUserId.get(userId);
                return presence ?? { userId, isOnline: false, lastSeenAt: null };
            }),
        };
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
            avatar: (file && file.path) ?? user.avatar,
            vehicle_type: updateUserDto.vehicle_type !== undefined ? updateUserDto.vehicle_type : user.vehicle_type,
            vehicle_model: updateUserDto.vehicle_model !== undefined ? updateUserDto.vehicle_model : user.vehicle_model,
            vehicle_color: updateUserDto.vehicle_color !== undefined ? updateUserDto.vehicle_color : user.vehicle_color,
            country: updateUserDto.country !== undefined ? updateUserDto.country : user.country,
            city: updateUserDto.city !== undefined ? updateUserDto.city : user.city,
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

        if (!user.password) {
            throw new BadRequestException("This account does not have a password. Please use social sign in.");
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

        try{
             await this.smtpProvider.sendMail(
                email,
                "OTP for password reset",
                otpEmailTemplate({name:user.nick_name, otp})
            );
        }catch(err){
            console.log(err)
        }

       

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
            otpEmailTemplate({ otp })
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

        const blockList = await this.prismaService.blockList.findUnique({
            where: {
                user_id_blocked_user_id: {
                    user_id: user.id,
                    blocked_user_id: blockedUserId
                }
            }
        });

        if(!blockList){
            throw new BadRequestException("You have not blocked this user")
        }
        await this.prismaService.blockList.delete({
            where:{
                user_id_blocked_user_id:{
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

    async deleteAccount (userId: string, password: string) {
        const user = await this.prismaService.user.findUnique({ where: { id: userId } });

        if (!user) {
            throw new NotFoundException("User not found");
        }

        if (!user.password) {
            throw new BadRequestException("This account does not have a password. Please use social sign in.");
        }

        // Here you would typically verify the password before deleting the account
        const passwordMatched = await this.encoder.compare(password, user.password);

        if (!passwordMatched) {
            throw new BadRequestException("Invalid password");
        }

        return await this.prismaService.user.update({
            where: { id: userId },
            data: { is_deleted: true }
        });
    }

    async helpAndSupport(){
        return "support@platechat.app"
    }

    async findUserByEmail(email:string){

        const user = await this.prismaService.user.findFirst({where:{email:email}})

        return user
    }

    async generateUserLink(userId:string){
        // Return just the userId - this will be encoded in QR code
        return userId
    }
    

    async generateQrCodeForUser(userId:string){

        const user = await this.prismaService.user.findUnique({where:{id:userId}})
        if(!user){
            throw new NotFoundException("User not found")
        }

        if(user.qr_code){
            return user.qr_code
        }

        const link = await this.generateUserLink(userId)
        const qrcode = await this.qrCodeGenerator.generateQrCode(link)

        await this.prismaService.user.update({
            where:{id:userId},
            data:{qr_code:qrcode}
        })
        return qrcode

    }

    /**
     * Get user info from QR code data and check for existing chat room
     * @param currentUserId - The user who is scanning the QR code
     * @param qrData - The data extracted from QR code (userId of the profile owner)
     * @returns User info with room ID if exists, otherwise with userId
     */
    async getUserInfoFromQrCode(currentUserId: string, qrData: string) {
        // QR data contains the userId of the profile being scanned
        const scannedUserId = qrData.trim();

        // Validate that user is not scanning their own QR code
        if (currentUserId === scannedUserId) {
            throw new BadRequestException("You cannot start a chat with yourself");
        }

        // Fetch the scanned user's information
        const scannedUser = await this.prismaService.user.findUnique({
            where: { id: scannedUserId },
            select: {
                id: true,
                nick_name: true,
                avatar: true,
                licence_id: true,
                is_blocked: true
            }
        });

        if (!scannedUser) {
            throw new NotFoundException("User not found");
        }

        const rating = await this.ratingService.getAverageRatingForUser(scannedUserId)
        Object.assign(scannedUser, { 
            rating: rating.averageRating,
            totalRating: rating.totalRatings,
            totalRatings: rating.totalRatings
        })

        if (scannedUser.is_blocked) {
            throw new BadRequestException("This user account has been blocked");
        }

        // Check if a chat room already exists between the two users
        const existingRoom = await this.chatService.getChatRoomIfExist(currentUserId, scannedUserId);

        if (existingRoom) {
            // Return existing room ID with user info
            return {
                roomId: existingRoom.id,
                user: scannedUser,
                isExistingChat: true
            };
        }

        // No existing room, return user info and userId for creating new chat
        return {
            user: scannedUser,
            isExistingChat: false
        };
    }

    /**
     * Get user profile with rating
     * @param userId 
     * @returns 
     */
    async getUserProfile(userId: string) {
        const user = await this.prismaService.user.findUnique({
            where: { id: userId },
            omit: { password: true, otp: true, otp_expires: true, otp_verification_token: true }
        });

        if (!user) {
            throw new NotFoundException("User not found");
        }

        // Get average rating for this user
        const ratingData = await this.ratingService.getAverageRatingForUser(userId);

        return {
            ...user,
            rating: ratingData.averageRating,
            totalRating: ratingData.totalRatings,
            totalRatings: ratingData.totalRatings
        };
    }

      async getUsersForAddingToGroup (groupChatRoomId: string, userId: string, paginationDto: PaginationDto)  {
        // Verify user is a member
        const membership = await this.prismaService.groupChatRoomMember.findFirst({
          where: {
            groupChatRoom_id: groupChatRoomId,
            user_id: userId,
          },
        });
    
        if (!membership) {
          throw new NotFoundException('You are not a member of this group');
        }
    
        const skip = (paginationDto.page - 1) * paginationDto.limit;
    
        const [users, total] = await Promise.all([
          this.prismaService.user.findMany({
            where: {
              NOT: {
                groupChatRooms: {
                  some: {
                    groupChatRoom_id: groupChatRoomId,
                  },
                },
              },
            },
            select: {
              id: true,
              nick_name: true,
              avatar: true,
              lastSeenAt: true,
            },
            skip,
            take: paginationDto.limit,
          }),
          this.prismaService.user.count({
            where: {
              NOT: {
                groupChatRooms: {
                  some: {
                    groupChatRoom_id: groupChatRoomId,
                  },
                },
              },
            },
          }),
        ]);
        
        return {
          users: users.map((user) => ({
            ...user,
            ...this.buildPresenceFields(user),
          })),
          total,
        };
      }
    
      async searchUsersToAddToGroup(groupChatRoomId: string, userId: string, query: string, paginationDto: PaginationDto) {
    
        
        // Verify user is a member
        const membership = await this.prismaService.groupChatRoomMember.findFirst({
          where: {
            groupChatRoom_id: groupChatRoomId,
            user_id: userId,
          },
        });
    
        if (!membership) {
          throw new NotFoundException('You are not a member of this group');
        }
    
    
    
        const skip = (paginationDto.page - 1) * paginationDto.limit;
    
        const searchUserWhere:UserWhereInput = {
            role:UserRole.USER,
          NOT: {
                groupChatRooms: {
                  some: {
                    groupChatRoom_id: groupChatRoomId,
                  },
                },
              },
              OR: [
                { nick_name: { contains: query, mode: 'insensitive' } },
                { email: { contains: query, mode: 'insensitive' } },
              ],
              
        }
    
        const [users, total] = await Promise.all([
          this.prismaService.user.findMany({
            where: searchUserWhere,
            select: {
              id: true,
              nick_name: true,
              avatar: true,
            },
            skip,
            take: paginationDto.limit,
          }),
          this.prismaService.user.count({
              where: searchUserWhere
          }),
        ]);
    
        return { users, total };
      }

    /**
     * Update user location
     * @param userId 
     * @param latitude 
     * @param longitude 
     * @param accuracy 
     * @returns 
     */
    async updateUserLocation(userId: string, latitude: number, longitude: number, accuracy?: number) {
        const user = await this.prismaService.user.findUnique({ where: { id: userId } });

        if (!user) {
            throw new NotFoundException("User not found");
        }

        // Check if user location already exists
        const existingLocation = await this.prismaService.userLocation.findUnique({
            where: { userId }
        });

        if (existingLocation) {
            // Update existing location
            return await this.prismaService.userLocation.update({
                where: { userId },
                data: {
                    latitude,
                    longitude,
                    accuracy
                }
            });
        } else {
            // Create new location record
            return await this.prismaService.userLocation.create({
                data: {
                    userId,
                    latitude,
                    longitude,
                    accuracy
                }
            });
        }
    }

    /**
     * Verify user license plate number
     * @param userId
     * @param plateNo
     * @returns
     */
    async verifyUserLicense(userId: string, plateNo: string) {
        const user = await this.prismaService.user.findUnique({
            where: { id: userId },
        });

        if (!user) {
            throw new NotFoundException("User not found");
        }

        if (!user.licence_id) {
            throw new BadRequestException("No license ID is registered for this user");
        }
        console.log(plateNo, user.licence_id)

        if (user.licence_id.trim().toLowerCase() !== plateNo.trim().toLowerCase()) {
            throw new BadRequestException("License plate number does not match your registered license ID");
        }

        const updatedUser = await this.prismaService.user.update({
            where: { id: userId },
            data: { license_no_verified: true },
        });

        return updatedUser;
    }

    /**
     * Add/update vehicle information for a user
     * @param userId 
     * @param addVehicleInfoDto 
     * @returns 
     */
    async addVehicleInfo(userId: string, addVehicleInfoDto: AddVehicleInfoDto) {
        const user = await this.prismaService.user.findUnique({ where: { id: userId } });

        if (!user) {
            throw new NotFoundException("User not found");
        }

        const updatedUser = await this.prismaService.user.update({
            where: { id: userId },
            data: {
                vehicle_type: addVehicleInfoDto.vehicle_type,
                vehicle_model: addVehicleInfoDto.vehicle_model,
                vehicle_color: addVehicleInfoDto.vehicle_color,
            },
        });

        return updatedUser;
    }

    /**
     * Update vehicle information for a user
     * @param userId 
     * @param updateVehicleInfoDto 
     * @returns 
     */
    async updateVehicleInfo(userId: string, updateVehicleInfoDto: UpdateVehicleInfoDto) {
        const user = await this.prismaService.user.findUnique({ where: { id: userId } });

        if (!user) {
            throw new NotFoundException("User not found");
        }

        const updatedData: Partial<User> = {};
        if (updateVehicleInfoDto.vehicle_type !== undefined) {
            updatedData.vehicle_type = updateVehicleInfoDto.vehicle_type;
        }
        if (updateVehicleInfoDto.vehicle_model !== undefined) {
            updatedData.vehicle_model = updateVehicleInfoDto.vehicle_model;
        }
        if (updateVehicleInfoDto.vehicle_color !== undefined) {
            updatedData.vehicle_color = updateVehicleInfoDto.vehicle_color;
        }

        const updatedUser = await this.prismaService.user.update({
            where: { id: userId },
            data: updatedData,
        });

        return updatedUser;
    }

    private buildPresenceFields(user: { id: string; lastSeenAt?: Date | string | null }) {
        const presence = this.socketRoomService.getPresence(user.id, user.lastSeenAt);
        return {
            isOnline: presence.isOnline,
            lastSeenAt: presence.lastSeenAt,
        };
    }
}

