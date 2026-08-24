# Implementation Guide: Message Requests in Chat List

## Quick Start - Step-by-Step Implementation

### BACKEND IMPLEMENTATION

#### Step 1: Create DTOs

**File:** `src/modules/chat/dtos/unified-chat-list.dto.ts`

```typescript
import { Type } from 'class-transformer';
import { IsEnum, IsOptional, IsNumber, Min } from 'class-validator';

export enum ChatListFilter {
  ALL = 'all',
  ACTIVE = 'active',
  PENDING = 'pending',
  REQUESTS = 'requests',
}

export enum ChatListSort {
  RECENT = 'recent',
  UNREAD = 'unread',
  ALPHA = 'alpha',
}

export class GetUnifiedChatListDto {
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  page: number = 1;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  limit: number = 20;

  @IsOptional()
  @IsEnum(ChatListFilter)
  filter: ChatListFilter = ChatListFilter.ALL;

  @IsOptional()
  @IsEnum(ChatListSort)
  sort: ChatListSort = ChatListSort.RECENT;
}

export class UserBasicDto {
  id: string;
  fullName: string;
  avatar?: string;
  nickName?: string;
}

export class MessagePreviewDto {
  id: string;
  message: string;
  type: 'TEXT' | 'FILE' | 'VOICE';
  isRead: boolean;
  isDelivered: boolean;
  createdAt: Date;
  sender?: UserBasicDto;
  fileUrl?: string;
  fileName?: string;
}

export class ChatRoomItemDto {
  type: 'chat_room';
  id: string;
  roomId: string;
  participantInfo: UserBasicDto;
  latestMessage?: MessagePreviewDto;
  unreadCount: number;
  lastMessageAt: Date;
  isBlocked?: boolean;
  isMuted?: boolean;
}

export class MessageRequestItemDto {
  type: 'message_request';
  id: string;
  requestId: string;
  senderInfo: UserBasicDto;
  firstMessage?: string;
  presetMessage?: string;
  status: 'PENDING';
  createdAt: Date;
  expiresAt?: Date;
  isExpired?: boolean;
  actions: {
    acceptUrl: string;
    declineUrl: string;
    blockUrl: string;
  };
}

export type ChatItemDto = ChatRoomItemDto | MessageRequestItemDto;

export class ChatListStatsDto {
  totalRooms: number;
  totalPendingRequests: number;
  totalUnreadMessages: number;
  totalBlockedUsers: number;
}

export class PaginationDto {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
}

export class UnifiedChatListResponseDto {
  items: ChatItemDto[];
  stats: ChatListStatsDto;
  pagination: PaginationDto;
}
```

#### Step 2: Update Service

**File:** `src/modules/chat/chat.service.ts`

Add these methods:

```typescript
// Add to chat.service.ts class

async getUnifiedChatList(
  userId: string,
  query: GetUnifiedChatListDto,
): Promise<UnifiedChatListResponseDto> {
  const { page, limit, sort, filter } = query;
  const skip = (page - 1) * limit;

  try {
    // Fetch data in parallel
    const [rooms, requests, blockedUsers] = await Promise.all([
      this.getChatRoomsForList(userId, filter),
      this.getMessageRequestsForList(userId, filter),
      this.getBlockedUserIds(userId),
    ]);

    // Transform to DTOs
    const roomItems: ChatRoomItemDto[] = await Promise.all(
      rooms.map(room => this.toChatRoomItemDto(room, userId)),
    );

    const requestItems: MessageRequestItemDto[] = requests
      .filter(req => !blockedUsers.includes(req.senderId.toString()))
      .map(req => this.toMessageRequestItemDto(req));

    // Combine items
    let items: ChatItemDto[] = [...roomItems, ...requestItems];

    // Sort
    items = this.sortChatItems(items, sort);

    // Calculate stats
    const stats: ChatListStatsDto = {
      totalRooms: rooms.length,
      totalPendingRequests: requests.length,
      totalUnreadMessages: roomItems.reduce((sum, r) => sum + r.unreadCount, 0),
      totalBlockedUsers: blockedUsers.length,
    };

    // Paginate
    const paginatedItems = items.slice(skip, skip + limit);
    const total = items.length;
    const totalPages = Math.ceil(total / limit);

    return {
      items: paginatedItems,
      stats,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
      },
    };
  } catch (error) {
    this.logger.error(
      `Error fetching unified chat list for user ${userId}:`,
      error.message,
    );
    throw new InternalServerErrorException('Failed to fetch chat list');
  }
}

private async getChatRoomsForList(
  userId: string,
  filter: ChatListFilter,
): Promise<ChatRoom[]> {
  if (filter === ChatListFilter.PENDING || filter === ChatListFilter.REQUESTS) {
    return [];
  }

  const rooms = await this.chatRoomModel.find({
    $or: [{ user1_id: userId }, { user2_id: userId }],
    is_deleted: { $ne: true },
  })
    .populate('user1')
    .populate('user2')
    .populate({
      path: 'chats',
      options: { sort: { createdAt: -1 }, limit: 1 },
    })
    .sort({ updatedAt: -1 })
    .exec();

  return rooms;
}

private async getMessageRequestsForList(
  userId: string,
  filter: ChatListFilter,
): Promise<MessageRequest[]> {
  if (filter === ChatListFilter.ACTIVE) {
    return [];
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const requests = await this.messageRequestModel.find({
    receiverId: userId,
    status: 'PENDING',
    createdAt: { $gte: thirtyDaysAgo },
  })
    .populate('sender')
    .populate('presetMessage')
    .sort({ createdAt: -1 })
    .exec();

  return requests;
}

private async getBlockedUserIds(userId: string): Promise<string[]> {
  const blocks = await this.blockListModel.find({
    $or: [{ user_id: userId }, { blocked_user_id: userId }],
  });

  return blocks.map(b =>
    b.user_id.toString() === userId
      ? b.blocked_user_id.toString()
      : b.user_id.toString(),
  );
}

private async toChatRoomItemDto(
  room: ChatRoom,
  userId: string,
): Promise<ChatRoomItemDto> {
  const otherUser = room.user1_id.toString() === userId ? room.user2 : room.user1;
  const latestMessage = room.chats?.[0];

  // Count unread messages
  const unreadCount = room.chats?.filter(
    m =>
      !m.is_read &&
      m.receiver_id.toString() === userId &&
      !m.isDeletedForEveryone,
  ).length || 0;

  return {
    type: 'chat_room',
    id: room.id,
    roomId: room.id,
    participantInfo: {
      id: otherUser.id,
      fullName: otherUser.full_name,
      avatar: otherUser.avatar_url,
      nickName: otherUser.nick_name,
    },
    latestMessage: latestMessage
      ? {
          id: latestMessage.id,
          message: latestMessage.message,
          type: latestMessage.type as 'TEXT' | 'FILE' | 'VOICE',
          isRead: latestMessage.is_read,
          isDelivered: latestMessage.is_delivered,
          createdAt: latestMessage.createdAt,
          sender: {
            id: latestMessage.sender_id.toString(),
            fullName: latestMessage.sender_id.toString() === userId ? 'You' : otherUser.full_name,
            avatar: latestMessage.sender_id.toString() === userId ? null : otherUser.avatar_url,
          },
          fileUrl: latestMessage.file_url,
          fileName: latestMessage.file_name,
        }
      : undefined,
    unreadCount,
    lastMessageAt: latestMessage?.createdAt || room.updatedAt,
  };
}

private toMessageRequestItemDto(req: MessageRequest): MessageRequestItemDto {
  const createdAt = new Date(req.createdAt);
  const expiresAt = new Date(createdAt.getTime() + 30 * 24 * 60 * 60 * 1000);
  const isExpired = expiresAt < new Date();

  return {
    type: 'message_request',
    id: req.id,
    requestId: req.id,
    senderInfo: {
      id: req.sender.id,
      fullName: req.sender.full_name,
      avatar: req.sender.avatar_url,
      nickName: req.sender.nick_name,
    },
    firstMessage: req.firstMessage,
    presetMessage: req.presetMessage?.message,
    status: 'PENDING',
    createdAt,
    expiresAt,
    isExpired,
    actions: {
      acceptUrl: `/chat/message-requests/${req.id}/accept`,
      declineUrl: `/chat/message-requests/${req.id}/decline`,
      blockUrl: `/chat/message-requests/${req.id}/block`,
    },
  };
}

private sortChatItems(items: ChatItemDto[], sortBy: ChatListSort): ChatItemDto[] {
  switch (sortBy) {
    case ChatListSort.RECENT:
      return items.sort((a, b) => {
        const timeA = a.type === 'chat_room' ? a.lastMessageAt : a.createdAt;
        const timeB = b.type === 'chat_room' ? b.lastMessageAt : b.createdAt;
        return new Date(timeB).getTime() - new Date(timeA).getTime();
      });

    case ChatListSort.UNREAD:
      return items.sort((a, b) => {
        // Pending requests come first
        if (a.type === 'message_request' && b.type === 'chat_room') return -1;
        if (a.type === 'chat_room' && b.type === 'message_request') return 1;

        // Then sort by unread count for rooms
        if (a.type === 'chat_room' && b.type === 'chat_room') {
          const unreadA = (a as ChatRoomItemDto).unreadCount || 0;
          const unreadB = (b as ChatRoomItemDto).unreadCount || 0;
          return unreadB - unreadA;
        }

        return 0;
      });

    case ChatListSort.ALPHA:
      return items.sort((a, b) => {
        const nameA =
          a.type === 'chat_room'
            ? (a as ChatRoomItemDto).participantInfo.fullName
            : (a as MessageRequestItemDto).senderInfo.fullName;
        const nameB =
          b.type === 'chat_room'
            ? (b as ChatRoomItemDto).participantInfo.fullName
            : (b as MessageRequestItemDto).senderInfo.fullName;
        return nameA.localeCompare(nameB);
      });

    default:
      return items;
  }
}
```

#### Step 3: Update Controller

**File:** `src/modules/chat/chat.controller.ts`

Add this endpoint:

```typescript
@Get('list')
@UseGuards(JwtAuthGuard)
@ResponseMessage('Chat list fetched successfully')
async getUnifiedChatList(
  @CurrentUser() user: TokenPayload,
  @Query() query: GetUnifiedChatListDto,
) {
  return await this.chatService.getUnifiedChatList(user.id, query);
}
```

#### Step 4: Update Existing Accept/Decline Endpoints

Enhance the existing endpoints to emit WebSocket events:

```typescript
// In chat.service.ts - update acceptMessageRequest method

async acceptMessageRequest(
  requestId: string,
  userId: string,
): Promise<{ room: ChatRoom; request: MessageRequest }> {
  // ... existing validation code ...

  const request = await this.messageRequestModel.findById(requestId);

  if (!request || request.receiverId.toString() !== userId) {
    throw new ForbiddenException('Not authorized to accept this request');
  }

  // Check if already accepted
  if (request.roomId) {
    const existingRoom = await this.chatRoomModel.findById(request.roomId);
    if (existingRoom) {
      return { room: existingRoom, request };
    }
  }

  // Create or get chat room
  const room = await this.getOrCreateChatRoom(
    request.senderId,
    request.receiverId,
  );

  // Update message request
  await this.messageRequestModel.findByIdAndUpdate(requestId, {
    status: 'ACCEPTED',
    roomId: room.id,
  });

  // Emit WebSocket events
  this.chatGateway.server
    .to(`user-${userId}`)
    .emit('message-request-accepted', {
      requestId,
      roomId: room.id,
      action: 'redirect-to-chat',
    });

  this.chatGateway.server
    .to(`user-${request.senderId.toString()}`)
    .emit('message-request-accepted-by-receiver', {
      requestId,
      roomId: room.id,
      receiverId: userId,
    });

  // Notify both to refresh their chat list
  this.chatGateway.server.to(`user-${userId}`).emit('chat-list-refresh', {
    action: 'request-accepted',
  });

  this.chatGateway.server
    .to(`user-${request.senderId.toString()}`)
    .emit('chat-list-refresh', {
      action: 'request-accepted-by-receiver',
    });

  return { room, request };
}

async declineMessageRequest(
  requestId: string,
  userId: string,
): Promise<MessageRequest> {
  const request = await this.messageRequestModel.findById(requestId);

  if (!request) {
    throw new NotFoundException('Message request not found');
  }

  // Only sender can decline (withdraw)
  if (request.senderId.toString() !== userId) {
    throw new ForbiddenException('Only sender can decline a pending request');
  }

  const updated = await this.messageRequestModel.findByIdAndUpdate(
    requestId,
    { status: 'DECLINED' },
    { new: true },
  );

  // Notify receiver
  this.chatGateway.server.to(`user-${request.receiverId.toString()}`).emit('message-request-withdrawn', {
    requestId,
  });

  this.chatGateway.server
    .to(`user-${request.receiverId.toString()}`)
    .emit('chat-list-refresh', {
      action: 'request-withdrawn',
    });

  return updated;
}

async rejectMessageRequest(
  requestId: string,
  userId: string,
): Promise<MessageRequest> {
  const request = await this.messageRequestModel.findById(requestId);

  if (!request) {
    throw new NotFoundException('Message request not found');
  }

  // Only receiver can reject
  if (request.receiverId.toString() !== userId) {
    throw new ForbiddenException('Only receiver can reject a request');
  }

  const updated = await this.messageRequestModel.findByIdAndUpdate(
    requestId,
    { status: 'REJECTED' },
    { new: true },
  );

  // Notify sender
  this.chatGateway.server
    .to(`user-${request.senderId.toString()}`)
    .emit('message-request-rejected', {
      requestId,
      rejectedBy: userId,
    });

  return updated;
}
```

---

### FRONTEND IMPLEMENTATION

#### Step 1: Create Service

**File:** `src/services/chat-list.service.ts` (Angular example)

```typescript
import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  ChatItemDto,
  UnifiedChatListResponseDto,
  ChatListFilter,
  ChatListSort,
} from '../models/chat.models';

@Injectable({
  providedIn: 'root',
})
export class ChatListService {
  private readonly baseUrl = '/api/chat';

  constructor(private http: HttpClient) {}

  getUnifiedChatList(
    page: number = 1,
    limit: number = 20,
    filter: ChatListFilter = ChatListFilter.ALL,
    sort: ChatListSort = ChatListSort.RECENT,
  ): Observable<{ data: UnifiedChatListResponseDto }> {
    const params = new HttpParams()
      .set('page', page.toString())
      .set('limit', limit.toString())
      .set('filter', filter)
      .set('sort', sort);

    return this.http.get<{ data: UnifiedChatListResponseDto }>(
      `${this.baseUrl}/list`,
      { params },
    );
  }

  acceptRequest(requestId: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/message-requests/${requestId}/accept`, {});
  }

  rejectRequest(requestId: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/message-requests/${requestId}/reject`, {});
  }

  declineRequest(requestId: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/message-requests/${requestId}/decline`, {});
  }

  blockSender(requestId: string): Observable<any> {
    return this.http.post(
      `${this.baseUrl}/message-requests/${requestId}/block`,
      {},
    );
  }
}
```

#### Step 2: Create Component

**File:** `src/components/unified-chat-list/unified-chat-list.component.ts`

```typescript
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import {
  ChatItemDto,
  ChatRoomItemDto,
  MessageRequestItemDto,
  ChatListStatsDto,
} from '../../models/chat.models';
import { ChatListService } from '../../services/chat-list.service';
import { SocketService } from '../../services/socket.service';

@Component({
  selector: 'app-unified-chat-list',
  templateUrl: './unified-chat-list.component.html',
  styleUrls: ['./unified-chat-list.component.scss'],
})
export class UnifiedChatListComponent implements OnInit, OnDestroy {
  items: ChatItemDto[] = [];
  stats: ChatListStatsDto;
  isLoading = false;
  currentPage = 1;
  limit = 20;
  selectedFilter = 'all';
  selectedSort = 'recent';

  private destroy$ = new Subject<void>();

  constructor(
    private chatService: ChatListService,
    private socketService: SocketService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.loadChatList();
    this.subscribeToRealTimeUpdates();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadChatList(page: number = 1): void {
    this.isLoading = true;
    this.currentPage = page;

    this.chatService
      .getUnifiedChatList(page, this.limit, this.selectedFilter as any, this.selectedSort as any)
      .pipe(takeUntil(this.destroy$))
      .subscribe(
        (response) => {
          this.items = response.data.items;
          this.stats = response.data.stats;
          this.isLoading = false;
        },
        (error) => {
          console.error('Error loading chat list:', error);
          this.isLoading = false;
        },
      );
  }

  get pendingRequests(): MessageRequestItemDto[] {
    return this.items.filter(
      (item) => item.type === 'message_request',
    ) as MessageRequestItemDto[];
  }

  get activeRooms(): ChatRoomItemDto[] {
    return this.items.filter(
      (item) => item.type === 'chat_room',
    ) as ChatRoomItemDto[];
  }

  onFilterChange(filter: string): void {
    this.selectedFilter = filter;
    this.loadChatList(1);
  }

  onSortChange(sort: string): void {
    this.selectedSort = sort;
    this.loadChatList(1);
  }

  acceptRequest(requestId: string, event?: Event): void {
    if (event) event.stopPropagation();

    this.chatService
      .acceptRequest(requestId)
      .pipe(takeUntil(this.destroy$))
      .subscribe(
        (response) => {
          this.loadChatList();
          // Optional: Navigate to newly created chat
          // this.router.navigate(['/chat', response.data.room.id]);
        },
        (error) => {
          console.error('Error accepting request:', error);
        },
      );
  }

  rejectRequest(requestId: string, event?: Event): void {
    if (event) event.stopPropagation();

    if (confirm('Are you sure you want to reject this request?')) {
      this.chatService
        .rejectRequest(requestId)
        .pipe(takeUntil(this.destroy$))
        .subscribe(
          () => {
            this.loadChatList();
          },
          (error) => {
            console.error('Error rejecting request:', error);
          },
        );
    }
  }

  blockSender(requestId: string, event?: Event): void {
    if (event) event.stopPropagation();

    if (confirm('Block this user? You won\'t be able to chat with them.')) {
      this.chatService
        .blockSender(requestId)
        .pipe(takeUntil(this.destroy$))
        .subscribe(
          () => {
            this.loadChatList();
          },
          (error) => {
            console.error('Error blocking user:', error);
          },
        );
    }
  }

  openChat(roomId: string): void {
    this.router.navigate(['/chat', roomId]);
  }

  openRequest(requestId: string): void {
    // Optional: Show request detail/preview modal
    // this.router.navigate(['/request', requestId]);
  }

  private subscribeToRealTimeUpdates(): void {
    // Listen for chat list refresh events
    this.socketService
      .on('chat-list-refresh')
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.loadChatList();
      });

    // Listen for message request acceptance
    this.socketService
      .on('message-request-accepted')
      .pipe(takeUntil(this.destroy$))
      .subscribe((event: any) => {
        if (event.action === 'redirect-to-chat') {
          this.openChat(event.roomId);
        }
      });

    // Listen for when request is withdrawn
    this.socketService
      .on('message-request-withdrawn')
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.loadChatList();
      });
  }

  formatDate(date: Date): string {
    const now = new Date();
    const messageDate = new Date(date);
    const diffMs = now.getTime() - messageDate.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return messageDate.toLocaleDateString();
  }
}
```

#### Step 3: Create Template

**File:** `src/components/unified-chat-list/unified-chat-list.component.html`

```html
<div class="chat-list-container">
  <!-- Header with filters and sorting -->
  <div class="chat-header">
    <h1>Messages</h1>
    <div class="controls">
      <select
        [(ngModel)]="selectedFilter"
        (change)="onFilterChange(selectedFilter)"
        class="filter-select"
      >
        <option value="all">All</option>
        <option value="active">Active Chats</option>
        <option value="pending">Pending Requests</option>
      </select>

      <select
        [(ngModel)]="selectedSort"
        (change)="onSortChange(selectedSort)"
        class="sort-select"
      >
        <option value="recent">Recent</option>
        <option value="unread">Unread First</option>
        <option value="alpha">A - Z</option>
      </select>
    </div>
  </div>

  <!-- Stats Bar -->
  <div class="stats-bar" *ngIf="stats">
    <div class="stat">
      <span class="label">Chats:</span>
      <span class="value">{{ stats.totalRooms }}</span>
    </div>
    <div class="stat">
      <span class="label">Requests:</span>
      <span class="value badge">{{ stats.totalPendingRequests }}</span>
    </div>
    <div class="stat">
      <span class="label">Unread:</span>
      <span class="value badge">{{ stats.totalUnreadMessages }}</span>
    </div>
  </div>

  <!-- Loading State -->
  <div *ngIf="isLoading" class="loading">
    <div class="spinner"></div>
    <p>Loading chats...</p>
  </div>

  <!-- Chat List -->
  <div *ngIf="!isLoading && items.length > 0" class="chat-list">
    <!-- Pending Requests Section -->
    <div *ngIf="pendingRequests.length > 0" class="section">
      <h2 class="section-title">
        <span class="icon">📌</span>
        Pending Requests ({{ pendingRequests.length }})
      </h2>

      <div
        *ngFor="let item of pendingRequests"
        class="chat-item request-item"
        [class.expired]="item.isExpired"
      >
        <div class="item-header">
          <img
            [src]="item.senderInfo.avatar || 'assets/default-avatar.png'"
            [alt]="item.senderInfo.fullName"
            class="avatar"
          />
          <div class="info">
            <h3 class="name">{{ item.senderInfo.fullName }}</h3>
            <p class="status">
              {{ item.isExpired ? 'Request expired' : 'Sent ' + formatDate(item.createdAt) }}
            </p>
          </div>
        </div>

        <!-- Preview Message -->
        <p class="preview-message" *ngIf="item.firstMessage || item.presetMessage">
          "{{ item.firstMessage || item.presetMessage }}"
        </p>

        <!-- Action Buttons -->
        <div class="actions">
          <button
            (click)="acceptRequest(item.requestId, $event)"
            [disabled]="item.isExpired"
            class="btn btn-accept"
          >
            ✓ Accept
          </button>
          <button
            (click)="rejectRequest(item.requestId, $event)"
            class="btn btn-decline"
          >
            ✗ Decline
          </button>
          <button
            (click)="blockSender(item.requestId, $event)"
            class="btn btn-block"
            title="Block this user"
          >
            🚫
          </button>
        </div>
      </div>
    </div>

    <!-- Active Chats Section -->
    <div *ngIf="activeRooms.length > 0" class="section">
      <h2 class="section-title">
        <span class="icon">💬</span>
        Chats ({{ activeRooms.length }})
      </h2>

      <div
        *ngFor="let item of activeRooms"
        class="chat-item room-item"
        (click)="openChat(item.roomId)"
      >
        <img
          [src]="item.participantInfo.avatar || 'assets/default-avatar.png'"
          [alt]="item.participantInfo.fullName"
          class="avatar"
        />

        <div class="content">
          <h3 class="name">{{ item.participantInfo.fullName }}</h3>
          <p class="message" *ngIf="item.latestMessage">
            <span *ngIf="!item.latestMessage.isRead" class="unread-indicator">●</span>
            {{ item.latestMessage.type === 'TEXT'
              ? item.latestMessage.message
              : item.latestMessage.type === 'FILE'
                ? '📎 ' + (item.latestMessage.fileName || 'File')
                : '🎙 Voice message' }}
          </p>
          <p class="message" *ngIf="!item.latestMessage" class="empty-state">
            No messages yet
          </p>
        </div>

        <div class="meta">
          <span class="time">{{ formatDate(item.lastMessageAt) }}</span>
          <span
            *ngIf="item.unreadCount > 0"
            class="badge unread-badge"
          >
            {{ item.unreadCount }}
          </span>
        </div>
      </div>
    </div>
  </div>

  <!-- Empty State -->
  <div *ngIf="!isLoading && items.length === 0" class="empty-state">
    <div class="empty-icon">💬</div>
    <h2>No messages yet</h2>
    <p>Start a conversation or wait for message requests</p>
    <button routerLink="/users" class="btn-primary">Find Users</button>
  </div>

  <!-- Pagination -->
  <div class="pagination" *ngIf="!isLoading && items.length > 0">
    <button (click)="loadChatList(currentPage - 1)" [disabled]="currentPage === 1">
      ← Previous
    </button>
    <span>Page {{ currentPage }}</span>
    <button (click)="loadChatList(currentPage + 1)">Next →</button>
  </div>
</div>
```

#### Step 4: Create Styles

**File:** `src/components/unified-chat-list/unified-chat-list.component.scss`

```scss
.chat-list-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #f5f5f5;

  .chat-header {
    background: white;
    padding: 16px;
    border-bottom: 1px solid #e0e0e0;
    display: flex;
    justify-content: space-between;
    align-items: center;

    h1 {
      margin: 0;
      font-size: 24px;
      font-weight: 600;
    }

    .controls {
      display: flex;
      gap: 8px;

      select {
        padding: 8px 12px;
        border: 1px solid #e0e0e0;
        border-radius: 4px;
        background: white;
        cursor: pointer;
      }
    }
  }

  .stats-bar {
    background: white;
    padding: 12px 16px;
    border-bottom: 1px solid #e0e0e0;
    display: flex;
    gap: 24px;

    .stat {
      display: flex;
      align-items: center;
      gap: 8px;

      .label {
        font-size: 12px;
        color: #666;
      }

      .value {
        font-size: 14px;
        font-weight: 600;
        color: #333;
      }

      .badge {
        background: #ff4081;
        color: white;
        padding: 2px 8px;
        border-radius: 12px;
        font-size: 12px;
      }
    }
  }

  .chat-list {
    flex: 1;
    overflow-y: auto;

    .section {
      .section-title {
        padding: 12px 16px;
        margin: 0;
        background: #fafafa;
        font-size: 12px;
        font-weight: 600;
        color: #666;
        text-transform: uppercase;
        border-bottom: 1px solid #e0e0e0;

        .icon {
          margin-right: 8px;
        }
      }

      .chat-item {
        background: white;
        border-bottom: 1px solid #e0e0e0;
        padding: 12px 16px;
        display: flex;
        align-items: flex-start;
        gap: 12px;
        cursor: pointer;
        transition: background 0.2s;

        &:hover {
          background: #fafafa;
        }

        &.request-item {
          flex-direction: column;
          padding: 16px;
          border: 1px solid #ffe0e0;
          margin: 8px 8px 0;
          border-radius: 8px;
          background: #fff8f8;

          &.expired {
            opacity: 0.6;
          }
        }

        .avatar {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          object-fit: cover;
          flex-shrink: 0;
        }

        .item-header {
          display: flex;
          gap: 12px;
          width: 100%;

          .info {
            flex: 1;
            min-width: 0;

            .name {
              margin: 0;
              font-size: 14px;
              font-weight: 500;
              color: #333;
            }

            .status {
              margin: 4px 0 0;
              font-size: 12px;
              color: #999;
            }
          }
        }

        .content {
          flex: 1;
          min-width: 0;

          .name {
            margin: 0;
            font-size: 14px;
            font-weight: 500;
            color: #333;
          }

          .message {
            margin: 4px 0 0;
            font-size: 12px;
            color: #666;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;

            .unread-indicator {
              color: #ff4081;
              font-weight: bold;
              margin-right: 4px;
            }
          }

          .empty-state {
            color: #999;
            font-style: italic;
          }
        }

        .meta {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;

          .time {
            font-size: 11px;
            color: #999;
          }

          .unread-badge {
            background: #ff4081;
            color: white;
            padding: 2px 6px;
            border-radius: 10px;
            font-size: 10px;
            font-weight: 600;
          }
        }

        .preview-message {
          margin: 8px 0;
          font-size: 13px;
          color: #555;
          font-style: italic;
          line-height: 1.4;
        }

        .actions {
          display: flex;
          gap: 8px;
          width: 100%;
          margin-top: 12px;

          .btn {
            flex: 1;
            padding: 8px 12px;
            border: none;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;

            &:disabled {
              opacity: 0.5;
              cursor: not-allowed;
            }

            &.btn-accept {
              background: #4caf50;
              color: white;

              &:hover:not(:disabled) {
                background: #45a049;
              }
            }

            &.btn-decline {
              background: #f44336;
              color: white;

              &:hover:not(:disabled) {
                background: #da190b;
              }
            }

            &.btn-block {
              background: #9e9e9e;
              color: white;
              flex: 0 0 auto;

              &:hover:not(:disabled) {
                background: #757575;
              }
            }
          }
        }
      }
    }
  }

  .loading {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 16px;

    .spinner {
      width: 40px;
      height: 40px;
      border: 4px solid #f3f3f3;
      border-top: 4px solid #ff4081;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      0% {
        transform: rotate(0deg);
      }
      100% {
        transform: rotate(360deg);
      }
    }

    p {
      color: #666;
      font-size: 14px;
    }
  }

  .empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 16px;
    padding: 32px;

    .empty-icon {
      font-size: 48px;
    }

    h2 {
      margin: 0;
      font-size: 18px;
      color: #333;
    }

    p {
      margin: 0;
      color: #999;
      font-size: 14px;
    }

    .btn-primary {
      padding: 12px 24px;
      background: #ff4081;
      color: white;
      border: none;
      border-radius: 4px;
      font-weight: 600;
      cursor: pointer;
      margin-top: 16px;

      &:hover {
        background: #e91e63;
      }
    }
  }

  .pagination {
    background: white;
    padding: 16px;
    border-top: 1px solid #e0e0e0;
    display: flex;
    justify-content: center;
    gap: 16px;

    button {
      padding: 8px 16px;
      border: 1px solid #e0e0e0;
      background: white;
      border-radius: 4px;
      cursor: pointer;
      font-weight: 600;

      &:hover:not(:disabled) {
        background: #f5f5f5;
      }

      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    }

    span {
      padding: 8px 16px;
      color: #666;
    }
  }
}
```

---

## Database Migration (Optional - for rejection tracking)

**File:** `prisma/migrations/[timestamp]_add_message_request_rejection_fields/migration.sql`

```sql
-- Add rejection tracking fields to MessageRequest
ALTER TABLE "MessageRequest" ADD COLUMN "rejectedAt" TIMESTAMP,
ADD COLUMN "rejectionReason" VARCHAR;

-- Add new status option (if using enum)
-- ALTER TYPE "MessageRequestStatus" ADD VALUE 'REJECTED';
```

---

## Integration Checklist

- [ ] **Backend**
  - [ ] Create DTOs
  - [ ] Implement `getUnifiedChatList()` in service
  - [ ] Add controller endpoint
  - [ ] Update WebSocket events
  - [ ] Test with Postman
  - [ ] Deploy to staging

- [ ] **Database**
  - [ ] Run migration (optional fields)
  - [ ] Verify indexes on `receiverId`, `status`, `createdAt`

- [ ] **Frontend**
  - [ ] Create service
  - [ ] Create component
  - [ ] Create template
  - [ ] Create styles
  - [ ] Add socket listener
  - [ ] Test with real API
  - [ ] Test on multiple devices

- [ ] **Testing**
  - [ ] Accept request flow
  - [ ] Reject request flow
  - [ ] Block user flow
  - [ ] Real-time list updates
  - [ ] Pagination
  - [ ] Filtering and sorting
  - [ ] Empty states

- [ ] **Documentation**
  - [ ] Update API docs
  - [ ] Update Postman collection
  - [ ] Create user documentation

