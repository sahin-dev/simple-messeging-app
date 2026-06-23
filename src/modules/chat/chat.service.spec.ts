import { Test, TestingModule } from '@nestjs/testing';
import { ChatService } from './chat.service';
import { PrismaService } from '../prisma/prisma.service';
import { RatingService } from '../rating/rating.service';
import { NotificationDispatcherService } from '../notification/services/notification-dispatcher.service';

describe('ChatService', () => {
  let service: ChatService;
  let prismaService: any;
  let socketRoomService: any;
  let notificationDispatcherService: any;

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
    },
    blockList: {
      findFirst: jest.fn(),
    },
    chatRoom: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    chat: {
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockRatingService = {};
  
  const mockNotificationDispatcherService = {
    dispatchChatNotification: jest.fn().mockResolvedValue(undefined),
  };

  const mockSocketRoomService = {
    isUserConnected: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: RatingService, useValue: mockRatingService },
        { provide: NotificationDispatcherService, useValue: mockNotificationDispatcherService },
        { provide: 'SOCKET_ROOM_SERVICE', useValue: mockSocketRoomService },
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);
    prismaService = module.get<PrismaService>(PrismaService);
    notificationDispatcherService = module.get<NotificationDispatcherService>(NotificationDispatcherService);
    socketRoomService = module.get<any>('SOCKET_ROOM_SERVICE');
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createMessage', () => {
    const senderId = 'sender123';
    const receiverId = 'receiver123';
    const sendMessageDto = {
      receiver_id: receiverId,
      message: 'Hello!',
    };

    beforeEach(() => {
      mockPrismaService.user.findUnique.mockResolvedValue({ id: receiverId });
      mockPrismaService.blockList.findFirst.mockResolvedValue(null);
      mockPrismaService.chatRoom.findFirst.mockResolvedValue({ id: 'room123', user1_id: senderId, user2_id: receiverId });
    });

    it('should save message to DB and dispatch notification when receiver is online', async () => {
      mockSocketRoomService.isUserConnected.mockResolvedValue(true);
      const mockSavedChat = { id: 'dbMessage123', chatRoom_id: 'room123', sender_id: senderId, receiver_id: receiverId, message: 'Hello!' };
      prismaService.chat.create.mockResolvedValue(mockSavedChat);

      const result = await service.createMessage(senderId, sendMessageDto);

      expect(prismaService.chat.create).toHaveBeenCalled();
      expect(prismaService.chatRoom.update).toHaveBeenCalled();
      expect(notificationDispatcherService.dispatchChatNotification).toHaveBeenCalledWith(mockSavedChat, receiverId);
      expect(result).toEqual(mockSavedChat);
    });

    it('should save message to DB and dispatch notification when receiver is offline', async () => {
      mockSocketRoomService.isUserConnected.mockResolvedValue(false);
      const mockSavedChat = { id: 'dbMessage123', chatRoom_id: 'room123', sender_id: senderId, receiver_id: receiverId, message: 'Hello!' };
      prismaService.chat.create.mockResolvedValue(mockSavedChat);

      const result = await service.createMessage(senderId, sendMessageDto);

      expect(prismaService.chat.create).toHaveBeenCalled();
      expect(prismaService.chatRoom.update).toHaveBeenCalled();
      expect(notificationDispatcherService.dispatchChatNotification).toHaveBeenCalledWith(mockSavedChat, receiverId);
      expect(result).toEqual(mockSavedChat);
    });
  });

  describe('acknowledgeMessageDelivery', () => {
    it('should update chat record in DB if messageId is provided', async () => {
      const regularId = '60c72b2f9b1d8e256c000001';
      const mockUpdatedChat = { id: regularId, is_delivered: true, is_read: true };
      prismaService.chat.update.mockResolvedValue(mockUpdatedChat);

      const result = await service.acknowledgeMessageDelivery(regularId);

      expect(prismaService.chat.update).toHaveBeenCalledWith({
        where: { id: regularId },
        data: { is_delivered: true, is_read: true },
      });
      expect(result).toEqual(mockUpdatedChat);
    });
  });
});
