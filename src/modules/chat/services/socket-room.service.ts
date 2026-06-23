import { Injectable, Inject, Logger, Optional } from '@nestjs/common';
import { WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';

/**
 * Service to handle socket.io room operations
 * This service is used to remove users from socket.io rooms
 * without creating circular dependencies between modules
 */
@Injectable()
export class SocketRoomService {
  private readonly logger = new Logger(SocketRoomService.name);
    @WebSocketServer()
    private server?: Server
  constructor(
   
   
  ) {}

  /**
   * Set the socket.io server instance
   * This is called by SocketGateway after the server is initialized
   */
  setServer(server: Server): void {
    this.server = server;
  }

  /**
   * Generate Socket.IO room ID for a group chat
   */
  private generateGroupRoomId(groupChatRoomId: string | number): string {
    return `group-${groupChatRoomId}`;
  }

  /**
   * Generate Socket.IO room ID for a user
   */
  private generateUserRoomId(userId: string | number): string {
    return `user-${userId}`;
  }

  /**
   * Check if a user is currently connected via socket
   * @param userId The user ID to check
   * @returns true if the user has at least one active socket connection
   */
  async isUserConnected(userId: string): Promise<boolean> {
    if (!this.server) {
      return false;
    }

    try {
      const userRoomId = this.generateUserRoomId(userId);
      const socketsInRoom = await this.server.in(userRoomId).fetchSockets();
      return socketsInRoom.length > 0;
    } catch (err) {
      this.logger.error(`Error checking connection status for user ${userId}:`, err);
      return false;
    }
  }

  /**
   * Remove a specific user from a group socket room
   * Called when user is removed via HTTP endpoint or leaves group
   */
  async removeUserFromGroupRoom(
    groupChatRoomId: string,
    userId: string,
  ): Promise<void> {
    if (!this.server) {
      this.logger.warn(
        'Socket.IO server not initialized, skipping socket room removal',
      );
      return;
    }

    try {
      const groupRoomId = this.generateGroupRoomId(groupChatRoomId);

      // Find all sockets belonging to the user in the group room
      const socketsInRoom = await this.server.in(groupRoomId).fetchSockets();
      let removedCount = 0;

      for (const socket of socketsInRoom) {
        if (socket.data.userId === userId) {
          socket.leave(groupRoomId);
          removedCount++;
        }
      }

      if (removedCount > 0) {
        this.logger.log(
          `Removed user ${userId} from group room ${groupChatRoomId} (${removedCount} socket(s) disconnected)`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Error removing user ${userId} from group room ${groupChatRoomId}:`,
        err,
      );
    }
  }

  /**
   * Broadcast notification to group members that a user was removed
   */
  async broadcastUserRemoved(
    groupChatRoomId: string,
    removedUserId: string,
    removedBy: string,
  ): Promise<void> {
    if (!this.server) {
      return;
    }

    try {
      const groupRoomId = this.generateGroupRoomId(groupChatRoomId);
      const memberUserRoomId = this.generateUserRoomId(removedUserId);

      // Notify all group members
      this.server.to(groupRoomId).emit('group-member-removed', {
        message: `Member was removed from the group`,
        memberId: removedUserId,
        removedBy: removedBy,
        groupChatRoomId: groupChatRoomId,
      });

      // Notify the removed member
      this.server.to(memberUserRoomId).emit('group-member-removed', {
        message: "You've been removed from a group",
        groupChatRoomId: groupChatRoomId,
        memberId: removedUserId,
      });

      this.logger.log(
        `Broadcasted removal of user ${removedUserId} from group ${groupChatRoomId}`,
      );
    } catch (err) {
      this.logger.error(
        `Error broadcasting user removal for group ${groupChatRoomId}:`,
        err,
      );
    }
  }

  /**
   * Broadcast notification to group members that a user left
   */
  async broadcastUserLeft(
    groupChatRoomId: string,
    userId: string,
  ): Promise<void> {
    if (!this.server) {
      return;
    }

    try {
      const groupRoomId = this.generateGroupRoomId(groupChatRoomId);

      this.server.to(groupRoomId).emit('group-member-removed', {
        message: `User left the group`,
        userId,
        groupChatRoomId: groupChatRoomId,
      });

      this.logger.log(
        `Broadcasted that user ${userId} left group ${groupChatRoomId}`,
      );
    } catch (err) {
      this.logger.error(
        `Error broadcasting user left for group ${groupChatRoomId}:`,
        err,
      );
    }
  }
}
