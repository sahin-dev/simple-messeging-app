import { Test, TestingModule } from '@nestjs/testing';
import { SocketRoomService } from './socket-room.service';

describe('SocketRoomService', () => {
  let service: SocketRoomService;
  let mockServer: any;

  beforeEach(async () => {
    mockServer = {
      in: jest.fn().mockReturnThis(),
      fetchSockets: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [SocketRoomService],
    }).compile();

    service = module.get<SocketRoomService>(SocketRoomService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('isUserConnected', () => {
    it('should return false if server is not set', async () => {
      const result = await service.isUserConnected('user123');
      expect(result).toBe(false);
    });

    it('should return true if server has active sockets in room', async () => {
      service.setServer(mockServer);
      mockServer.fetchSockets.mockResolvedValue([{ id: 'socket1' }]);

      const result = await service.isUserConnected('user123');

      expect(mockServer.in).toHaveBeenCalledWith('user-user123');
      expect(mockServer.fetchSockets).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return false if server has no active sockets in room', async () => {
      service.setServer(mockServer);
      mockServer.fetchSockets.mockResolvedValue([]);

      const result = await service.isUserConnected('user123');

      expect(mockServer.in).toHaveBeenCalledWith('user-user123');
      expect(mockServer.fetchSockets).toHaveBeenCalled();
      expect(result).toBe(false);
    });

    it('should return false if fetchSockets throws an error', async () => {
      service.setServer(mockServer);
      mockServer.fetchSockets.mockRejectedValue(new Error('Connection error'));

      const result = await service.isUserConnected('user123');
      expect(result).toBe(false);
    });
  });
});
