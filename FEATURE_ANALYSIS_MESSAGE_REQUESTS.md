# Feature Analysis: Message Requests Integration with Chat Room List

## 1. REQUIREMENT OVERVIEW

**Goal:** Display pending message requests alongside chat rooms in the unified chat list screen, allowing users to:
- Accept requests → Continue chatting like normal rooms
- Reject requests → Block communication with sender
- View both active chats and pending requests in one screen

---

## 2. CURRENT STATE ANALYSIS

### ✅ What Already Exists

The system **already has the core infrastructure** for message requests:

| Component | Current Status | Location |
|-----------|---|---|
| **MessageRequest Model** | ✅ Fully implemented | `prisma/schema.prisma` |
| **Message Request Endpoints** | ✅ Complete CRUD | `src/modules/chat/chat.controller.ts` |
| **Request Status Tracking** | ✅ PENDING, ACCEPTED, DECLINED | MessageRequest schema |
| **Accept/Decline Logic** | ✅ Already creates ChatRoom on accept | `chat.service.ts` |
| **Inbox/Sent Lists** | ✅ Separate paginated endpoints | `/chat/message-requests/inbox` |
| **Blocking System** | ✅ Prevents communication | BlockList model |

### ⚠️ Gaps to Address

| Gap | Impact | Solution |
|-----|--------|----------|
| **Separate endpoints** | Frontend makes 2 calls for unified list | Combine into single "chat-items" endpoint |
| **No unified data type** | Different response structures for rooms vs requests | Create unified `ChatItemDto` (polymorphic response) |
| **Request status visibility** | Can't filter/sort mixed results | Add status field and sorting options |
| **No rejection timestamp** | Can't show rejection history | Add `rejectedAt` and `rejectionReason` fields to MessageRequest |
| **Limited rejection types** | Only DECLINED vs REJECTED state | Distinguish: DECLINED (sender pulls back) vs REJECTED (receiver refuses) |

---

## 3. ARCHITECTURE COMPARISON

### Current Message Request Flow
```
User A sends message request
         ↓
   MessageRequest created (status: PENDING)
         ↓
User B views GET /chat/message-requests/inbox
         ↓
   User B accepts/declines
         ↓
   ChatRoom created + MessageRequest.status = ACCEPTED
         ↓
   Both can now chat
```

### Proposed Unified Flow
```
User A sends message request
         ↓
   MessageRequest created (status: PENDING, type: 'request')
         ↓
User B calls GET /chat/list (single call - new endpoint)
         ↓
   Returns: { chatRooms: [...], messageRequests: [...], total: N }
   ↓
   Frontend displays mixed list with visual differentiation
         ↓
   User B accepts/declines (existing endpoints still work)
         ↓
   ChatRoom created + MessageRequest moves to ACCEPTED status
         ↓
   Refresh list → Request disappears from pending, shows as chat room
```

---

## 4. DATABASE SCHEMA CHANGES (Minimal)

### Add to MessageRequest Model
```prisma
model MessageRequest {
  // ... existing fields ...
  
  // NEW: Track rejection state more granularly
  status              MessageRequestStatus  // PENDING | ACCEPTED | DECLINED | REJECTED
  rejectedAt          DateTime?             // When receiver rejected (NEW)
  rejectionReason     String?               // "block_sender", "decline_quietly" (NEW)
  
  // Existing fields that are important:
  // - sender, receiver, preset message
  // - firstMessage (alert type initial message)
  // - roomId (set after acceptance)
}

enum MessageRequestStatus {
  PENDING   // Waiting for response
  ACCEPTED  // User accepted - ChatRoom now exists
  DECLINED  // Sender withdrew request (before response)
  REJECTED  // Receiver refused request (new state)
}
```

**Optional Enhancement:** Add `metadata` JSON field for frontend state:
```prisma
metadata Json? // { "readBy": ["userId1"], "viewedAt": "2024-01-15T..." }
```

---

## 5. BACKEND IMPLEMENTATION ROADMAP

### Phase 1: Create Unified Endpoint

**New Endpoint:** `GET /chat/list` (consolidates rooms + requests)

```typescript
// chat.controller.ts

@Get('list')
@UseGuards(JwtAuthGuard)
async getUnifiedChatList(
  @CurrentUser() user: TokenPayload,
  @Query() query: GetUnifiedChatListDto,
) {
  // query: { page, limit, sort, filter }
  // filter: 'all' | 'active' | 'pending' | 'requests'
  // sort: 'recent' | 'unread' | 'alpha'
  return this.chatService.getUnifiedChatList(user.id, query);
}
```

**Response DTO Structure:**
```typescript
interface UnifiedChatListResponse {
  success: boolean;
  statusCode: 200;
  message: string;
  data: {
    items: ChatItemDto[]; // Polymorphic array
    stats: {
      totalRooms: number;
      totalPendingRequests: number;
      totalUnreadMessages: number;
    };
    pagination: {
      page: number;
      limit: number;
      total: number;
    };
  };
}

// Polymorphic union type
type ChatItemDto = ChatRoomItemDto | MessageRequestItemDto;

interface ChatRoomItemDto {
  type: 'chat_room';
  id: string;
  roomId: string;
  participantInfo: UserBasicDto;
  latestMessage: MessageDto;
  unreadCount: number;
  lastMessageAt: DateTime;
}

interface MessageRequestItemDto {
  type: 'message_request';
  id: string;
  requestId: string;
  senderInfo: UserBasicDto;
  firstMessage?: string; // From preset message
  status: 'PENDING';
  createdAt: DateTime;
  expiresAt?: DateTime; // Optional: requests expire after X days
  actions: {
    acceptUrl: string;     // POST /chat/message-requests/{id}/accept
    declineUrl: string;    // POST /chat/message-requests/{id}/decline
    blockUrl: string;      // POST /chat/message-requests/{id}/block
  };
}
```

### Phase 2: Enhance Message Request Endpoints

**Add status tracking to existing endpoints:**

```typescript
// POST /chat/message-requests/:id/accept
// ✅ Already creates ChatRoom
// NEW: Emit WebSocket event to notify both users
// NEW: Return ChatRoom details so frontend can navigate

// POST /chat/message-requests/:id/decline OR /reject
// Rename: standardize to single endpoint with action param
// Or: Keep both but /decline is sender-side, /reject is receiver-side
// NEW: Add rejectionReason field for analytics
// NEW: Delete message request from pending list
// NEW: Don't auto-block (user needs explicit /block endpoint)

// POST /chat/message-requests/:id/block
// ✅ Already exists
// NEW: Auto-decline the request + add to BlockList
```

**Add expiration logic (Optional but recommended):**
```typescript
// Message requests older than 30 days → auto-decline
// Helps cleanup and prevents stale requests in UI
// Run as scheduled job: cleanup.task.ts

// Check before returning in unified list:
if (request.createdAt < 30 days ago && status === PENDING) {
  return null; // Filter from list
}
```

### Phase 3: Service Layer Implementation

```typescript
// chat.service.ts

async getUnifiedChatList(
  userId: string,
  query: GetUnifiedChatListDto,
): Promise<UnifiedChatListResponse> {
  const { page, limit, sort, filter } = query;
  const skip = (page - 1) * limit;

  // Parallel queries for performance
  const [rooms, requests, blockedUsers] = await Promise.all([
    this.getChatRooms(userId, filter),
    this.getMessageRequests(userId, filter),
    this.getBlockedUsers(userId),
  ]);

  // Transform to DTOs
  const roomItems = rooms.map(room => this.toChatRoomItemDto(room, userId));
  const requestItems = requests
    .filter(req => !blockedUsers.includes(req.senderId))
    .map(req => this.toMessageRequestItemDto(req));

  // Combine and sort
  const items = this.mergeAndSort([...roomItems, ...requestItems], sort);

  // Paginate combined results
  const paginatedItems = items.slice(skip, skip + limit);
  const total = items.length;

  return {
    success: true,
    statusCode: 200,
    message: 'Chat list fetched successfully',
    data: {
      items: paginatedItems,
      stats: {
        totalRooms: rooms.length,
        totalPendingRequests: requests.length,
        totalUnreadMessages: rooms.reduce((sum, r) => sum + r.unread_count, 0),
      },
      pagination: { page, limit, total },
    },
  };
}

private async getMessageRequests(
  userId: string,
  filter: string,
): Promise<MessageRequest[]> {
  if (filter === 'active') return []; // Skip requests if showing active only

  return this.messageRequestModel.find({
    receiverId: userId,
    status: MessageRequestStatus.PENDING,
    createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }, // Last 30 days
  });
}

private mergeAndSort(
  items: ChatItemDto[],
  sortBy: string,
): ChatItemDto[] {
  switch (sortBy) {
    case 'recent':
      return items.sort((a, b) => {
        const timeA = a.type === 'chat_room' ? a.lastMessageAt : a.createdAt;
        const timeB = b.type === 'chat_room' ? b.lastMessageAt : b.createdAt;
        return new Date(timeB).getTime() - new Date(timeA).getTime();
      });
    case 'unread':
      // Rooms with unread messages first, then requests, then read rooms
      return items.sort((a, b) => {
        if (a.type === 'message_request') return b.type === 'message_request' ? 0 : -1;
        if (b.type === 'message_request') return 1;
        const unreadA = (a as ChatRoomItemDto).unreadCount || 0;
        const unreadB = (b as ChatRoomItemDto).unreadCount || 0;
        return unreadB - unreadA;
      });
    case 'alpha':
      return items.sort((a, b) => {
        const nameA = a.type === 'chat_room' 
          ? (a as ChatRoomItemDto).participantInfo.fullName 
          : (a as MessageRequestItemDto).senderInfo.fullName;
        const nameB = b.type === 'chat_room'
          ? (b as ChatRoomItemDto).participantInfo.fullName
          : (b as MessageRequestItemDto).senderInfo.fullName;
        return nameA.localeCompare(nameB);
      });
    default:
      return items;
  }
}

private toChatRoomItemDto(room: ChatRoom, userId: string): ChatRoomItemDto {
  const otherUser = room.user1_id === userId ? room.user2 : room.user1;
  return {
    type: 'chat_room',
    id: room.id,
    roomId: room.id,
    participantInfo: {
      id: otherUser.id,
      fullName: otherUser.full_name,
      avatar: otherUser.avatar_url,
    },
    latestMessage: room.chats?.[0],
    unreadCount: room.chats?.filter(m => !m.is_read && m.receiver_id === userId).length || 0,
    lastMessageAt: room.chats?.[0]?.createdAt || room.updatedAt,
  };
}

private toMessageRequestItemDto(req: MessageRequest): MessageRequestItemDto {
  return {
    type: 'message_request',
    id: req.id,
    requestId: req.id,
    senderInfo: {
      id: req.sender.id,
      fullName: req.sender.full_name,
      avatar: req.sender.avatar_url,
    },
    firstMessage: req.presetMessage?.message || req.firstMessage,
    status: 'PENDING' as const,
    createdAt: req.createdAt,
    expiresAt: new Date(req.createdAt.getTime() + 30 * 24 * 60 * 60 * 1000),
    actions: {
      acceptUrl: `/chat/message-requests/${req.id}/accept`,
      declineUrl: `/chat/message-requests/${req.id}/decline`,
      blockUrl: `/chat/message-requests/${req.id}/block`,
    },
  };
}
```

### Phase 4: WebSocket Real-time Updates

**Add event emitters for unified list updates:**

```typescript
// When message request is accepted
@Post('message-requests/:id/accept')
async acceptMessageRequest(
  @Param('id') requestId: string,
  @CurrentUser() user: TokenPayload,
) {
  const result = await this.chatService.acceptMessageRequest(requestId, user.id);
  
  // Emit to both users that list should refresh
  this.chatGateway.server
    .to(`user-${user.id}`)
    .emit('chat-list-updated', { action: 'request-accepted', requestId });
  
  this.chatGateway.server
    .to(`user-${result.room.user1_id === user.id ? result.room.user2_id : result.room.user1_id}`)
    .emit('chat-list-updated', { action: 'new-chat-room', roomId: result.room.id });
  
  return result;
}

// When message request is rejected
@Post('message-requests/:id/reject')
async rejectMessageRequest(
  @Param('id') requestId: string,
  @CurrentUser() user: TokenPayload,
) {
  const request = await this.chatService.rejectMessageRequest(requestId, user.id);
  
  this.chatGateway.server
    .to(`user-${request.senderId}`)
    .emit('chat-list-updated', { action: 'request-rejected', requestId });
    
  return { success: true, message: 'Request rejected' };
}
```

---

## 6. FRONTEND IMPLEMENTATION GUIDE

### Recommended UI Structure

```
┌─────────────────────────────────────┐
│  Unified Chat List                  │
├─────────────────────────────────────┤
│                                     │
│  📌 PENDING REQUESTS (3)           │
│  ┌──────────────────────────────┐  │
│  │ 👤 John Doe                  │  │
│  │ "Hey, I want to chat"        │  │
│  │ [Accept] [Decline] [Block]   │  │
│  └──────────────────────────────┘  │
│  ┌──────────────────────────────┐  │
│  │ 👤 Jane Smith                │  │
│  │ "Let's connect"              │  │
│  │ [Accept] [Decline] [Block]   │  │
│  └──────────────────────────────┘  │
│                                     │
│  💬 ACTIVE CHATS (5)               │
│  ┌──────────────────────────────┐  │
│  │ 👤 Mike Wilson         3 🔴  │  │
│  │ "See you tomorrow!"          │  │
│  │ 2 min ago                    │  │
│  └──────────────────────────────┘  │
│  ┌──────────────────────────────┐  │
│  │ 👤 Sarah Brown         1 🔴  │  │
│  │ "Sounds good"                │  │
│  │ 1 hour ago                   │  │
│  └──────────────────────────────┘  │
│                                     │
```

### API Integration

```typescript
// Frontend service
class ChatListService {
  
  getUnifiedChatList(
    page: number = 1,
    limit: number = 20,
    filter: 'all' | 'active' | 'pending' = 'all',
    sort: 'recent' | 'unread' | 'alpha' = 'recent',
  ) {
    return this.http.get('/chat/list', {
      params: { page, limit, filter, sort }
    });
  }

  // Existing endpoints still work independently
  acceptRequest(requestId: string) {
    return this.http.post(`/chat/message-requests/${requestId}/accept`, {});
  }

  rejectRequest(requestId: string) {
    return this.http.post(`/chat/message-requests/${requestId}/reject`, {});
  }

  blockSender(requestId: string) {
    return this.http.post(`/chat/message-requests/${requestId}/block`, {});
  }
}
```

### WebSocket Real-time Updates

```typescript
// Listen for list updates
this.socketService.on('chat-list-updated', (event: {
  action: 'request-accepted' | 'request-rejected' | 'new-chat-room';
  requestId?: string;
  roomId?: string;
}) => {
  // Refresh list or update specific item
  this.refreshChatList();
});
```

### Component Example

```typescript
@Component({
  selector: 'app-chat-list',
  template: `
    <div class="chat-list">
      <!-- Pending Requests Section -->
      <div *ngIf="pendingRequests.length > 0" class="section">
        <h2>Pending Requests ({{ pendingRequests.length }})</h2>
        <div *ngFor="let item of pendingRequests" class="request-item">
          <div class="request-header">
            <img [src]="item.senderInfo.avatar" alt="avatar">
            <span>{{ item.senderInfo.fullName }}</span>
          </div>
          <p class="message">{{ item.firstMessage }}</p>
          <div class="actions">
            <button (click)="acceptRequest(item.requestId)" class="btn-accept">
              Accept
            </button>
            <button (click)="rejectRequest(item.requestId)" class="btn-decline">
              Decline
            </button>
            <button (click)="blockSender(item.requestId)" class="btn-block">
              Block
            </button>
          </div>
        </div>
      </div>

      <!-- Active Chats Section -->
      <div *ngIf="activeRooms.length > 0" class="section">
        <h2>Chats ({{ activeRooms.length }})</h2>
        <div *ngFor="let item of activeRooms" class="room-item">
          <img [src]="item.participantInfo.avatar" alt="avatar">
          <div class="room-content">
            <h3>{{ item.participantInfo.fullName }}</h3>
            <p>{{ item.latestMessage?.message }}</p>
            <span class="time">{{ item.lastMessageAt | timeago }}</span>
          </div>
          <span *ngIf="item.unreadCount > 0" class="badge">
            {{ item.unreadCount }}
          </span>
        </div>
      </div>

      <!-- Empty State -->
      <div *ngIf="items.length === 0" class="empty-state">
        <p>No chats or requests yet. Start a conversation!</p>
      </div>
    </div>
  `,
})
export class ChatListComponent implements OnInit {
  items: ChatItemDto[] = [];
  stats: ChatStats;

  constructor(private chatService: ChatListService) {}

  ngOnInit() {
    this.loadChatList();
    this.subscribeToUpdates();
  }

  loadChatList() {
    this.chatService.getUnifiedChatList(1, 20, 'all', 'recent').subscribe(
      (response) => {
        this.items = response.data.items;
        this.stats = response.data.stats;
      }
    );
  }

  get pendingRequests() {
    return this.items.filter(i => i.type === 'message_request');
  }

  get activeRooms() {
    return this.items.filter(i => i.type === 'chat_room');
  }

  acceptRequest(requestId: string) {
    this.chatService.acceptRequest(requestId).subscribe(() => {
      this.loadChatList(); // Refresh
    });
  }

  rejectRequest(requestId: string) {
    this.chatService.rejectRequest(requestId).subscribe(() => {
      this.loadChatList(); // Refresh
    });
  }

  blockSender(requestId: string) {
    this.chatService.blockSender(requestId).subscribe(() => {
      this.loadChatList(); // Refresh
    });
  }

  subscribeToUpdates() {
    this.socketService.on('chat-list-updated', () => {
      this.loadChatList();
    });
  }
}
```

---

## 7. IMPLEMENTATION PHASES & EFFORT ESTIMATE

### Phase 1: Backend - Unified Endpoint
- Create `GetUnifiedChatListDto` DTO
- Implement `getUnifiedChatList()` in service
- Add controller endpoint
- **Effort:** 3-4 hours
- **Complexity:** Medium

### Phase 2: Backend - Enhance Existing Endpoints
- Standardize accept/decline/block responses
- Add WebSocket events
- Update service logic
- **Effort:** 2-3 hours
- **Complexity:** Low

### Phase 3: Database - Schema Updates (Optional)
- Add `rejectedAt`, `rejectionReason` fields
- Create migration
- **Effort:** 1 hour
- **Complexity:** Low

### Phase 4: Frontend - UI Components
- Create unified list component
- Implement request/room item components
- Add filtering/sorting
- **Effort:** 6-8 hours
- **Complexity:** Medium

### Phase 5: Frontend - Integration
- Connect to new backend endpoint
- WebSocket listener setup
- Action handlers
- **Effort:** 2-3 hours
- **Complexity:** Low

**Total Backend Effort:** ~6-7 hours  
**Total Frontend Effort:** ~8-11 hours  
**Total Project:** ~14-18 hours

---

## 8. TESTING STRATEGY

### Backend Tests

```typescript
describe('Chat List - Unified Endpoint', () => {
  
  it('should return empty lists when user has no chats or requests', async () => {
    // Setup: new user
    // Call: GET /chat/list
    // Assert: items = [], stats.totalRooms = 0, stats.totalPendingRequests = 0
  });

  it('should combine active rooms and pending requests in single call', async () => {
    // Setup: User A has 3 chats and 2 pending requests
    // Call: GET /chat/list
    // Assert: items.length = 5, filter by type
  });

  it('should exclude blocked senders from request list', async () => {
    // Setup: User A blocked User B, but User B sent request
    // Call: GET /chat/list
    // Assert: User B's request not in response
  });

  it('should sort by recent (combined rooms and requests)', async () => {
    // Setup: Room from 1 hour ago, Request from 30 min ago
    // Call: GET /chat/list?sort=recent
    // Assert: Request appears first
  });

  it('should accept request and convert to room', async () => {
    // Setup: Pending request exists
    // Call: POST /chat/message-requests/{id}/accept
    // Assert: ChatRoom created, MessageRequest.status = ACCEPTED
  });

  it('should reject request and prevent further communication', async () => {
    // Setup: Pending request exists
    // Call: POST /chat/message-requests/{id}/reject
    // Assert: MessageRequest.status = REJECTED, sender gets event
  });
});
```

### Frontend Tests

```typescript
describe('Unified Chat List Component', () => {
  
  it('should display pending requests section when requests exist', () => {
    // Setup: Mock response with requests
    // Assert: "Pending Requests" section visible
  });

  it('should display chats section with unread badges', () => {
    // Setup: Mock response with rooms
    // Assert: Rooms displayed with unread count badges
  });

  it('should accept request and refresh list', () => {
    // Setup: Mock request accept response
    // Assert: Item removed from requests, appears in chats
  });

  it('should handle real-time updates via WebSocket', () => {
    // Setup: Listen to 'chat-list-updated'
    // Assert: List refreshes when event received
  });
});
```

---

## 9. ERROR HANDLING & EDGE CASES

| Scenario | Backend Handling | Frontend Display |
|----------|---|---|
| User A sends request while User B has them blocked | ✅ Prevent request creation (check BlockList) | Show error: "User has blocked you" |
| Request expires (30+ days old) | Filter from query | Not shown in list |
| User accepts request but ChatRoom already exists | ✅ Return existing room | Redirect to chat |
| User rejects then tries to message | ❌ Prevent message creation | Show error: "Request was rejected" |
| Network error during accept | Rollback transaction | Retry UI component |
| Concurrent accept from both ends | Handle with unique constraint | Only one ChatRoom created |

---

## 10. DEPLOYMENT CHECKLIST

- [ ] Migrations run successfully (new fields)
- [ ] New endpoint tested in staging
- [ ] Backward compatibility verified (old endpoints still work)
- [ ] Database indexes verified for query performance
- [ ] WebSocket event listeners tested
- [ ] Frontend build passes
- [ ] E2E tests pass on unified list
- [ ] Postman collection updated
- [ ] API documentation updated
- [ ] Release notes prepared

---

## 11. FUTURE ENHANCEMENTS

1. **Request Expiration:** Auto-decline requests older than 30 days
2. **Request Templates:** Pre-written common opening messages
3. **Read Receipts for Requests:** Track if request was viewed
4. **Typing Indicators:** Show "User is typing..." before acceptance
5. **Request Preview:** Load message thread preview without accepting
6. **Smart Filtering:** ML-based spam detection for requests
7. **Request Scheduling:** Schedule message requests for future dates

---

## Summary Table: Current vs Proposed

| Feature | Current State | Proposed State |
|---------|---|---|
| **Message Requests** | ✅ Full endpoints | ✅ Integrated in unified view |
| **Chat Rooms** | ✅ Full implementation | ✅ No changes needed |
| **List Screen** | ❌ Two separate endpoints | ✅ Single `/chat/list` endpoint |
| **Unified Response** | ❌ Different DTOs | ✅ Polymorphic `ChatItemDto` |
| **Real-time Updates** | ✅ WebSocket exists | ✅ Extends for list updates |
| **Rejection Tracking** | ⚠️ Partial (no timestamp) | ✅ Added fields |
| **Frontend Integration** | ❌ Complex logic needed | ✅ Simple list rendering |

