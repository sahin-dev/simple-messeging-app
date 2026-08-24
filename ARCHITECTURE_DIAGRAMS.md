# Message Requests Feature - Architecture Diagram

## Data Flow: Current vs Proposed

### Current Architecture (Two Separate Calls)
```
Frontend
   │
   ├─→ GET /chat/rooms → ChatRoom[]  ──→ Transform to RoomDto
   │
   └─→ GET /chat/message-requests/inbox → MessageRequest[] ──→ Transform to RequestDto
   
   Result: Two separate data structures, frontend must merge manually
   ❌ More network calls
   ❌ Complex client-side logic
   ❌ Inconsistent sorting/filtering
```

### Proposed Architecture (Single Unified Call)
```
Frontend
   │
   └─→ GET /chat/list?filter=all&sort=recent
        │
        │ Backend
        ├─→ Fetch ChatRooms (parallel)
        │
        ├─→ Fetch MessageRequests (parallel)
        │
        ├─→ Transform to polymorphic ChatItemDto[]
        │
        ├─→ Apply filtering & sorting
        │
        └─→ Return { items: ChatItemDto[], stats, pagination }
   
   Result: Single response with both types
   ✅ One network call
   ✅ Server-side sorting/filtering
   ✅ Clear metadata & stats
   ✅ Easier pagination
```

---

## Entity Relationship Diagram

```
User
├── (has many) ChatRoom (user1_id, user2_id)
│   └── (has many) Chat messages
│
├── (has many) MessageRequest (senderId/receiverId)
│   ├── Status: PENDING → ACCEPTED → ChatRoom created
│   │         : PENDING → REJECTED → Blocked
│   │         : PENDING → DECLINED → Withdrawn by sender
│   └── Linked to PresetMessage
│
└── (has many) BlockList
    └── Prevents messaging
```

---

## Component Hierarchy (Frontend)

```
ChatListContainer
├── Header
│   ├── Title
│   ├── Filter Dropdown (all/active/pending)
│   └── Sort Dropdown (recent/unread/alpha)
│
├── StatsBar
│   ├── Total Chats
│   ├── Pending Requests (badge)
│   └── Unread Messages (badge)
│
└── ChatList
    ├── PendingRequestsSection
    │   ├── RequestItem (repeated)
    │   │   ├── Avatar + Name + Time
    │   │   ├── Preview Message
    │   │   └── Action Buttons
    │   │       ├── Accept
    │   │       ├── Decline
    │   │       └── Block
    │   └── Empty State
    │
    ├── ActiveChatsSection
    │   ├── ChatRoomItem (repeated)
    │   │   ├── Avatar + Name + Time
    │   │   ├── Latest Message Preview
    │   │   └── Unread Badge
    │   └── Empty State
    │
    └── Pagination
        ├── Previous Button
        ├── Page Number
        └── Next Button
```

---

## API Response Structure

### Request
```
GET /chat/list?page=1&limit=20&filter=all&sort=recent
```

### Response
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Chat list fetched successfully",
  "data": {
    "items": [
      // Type 1: Message Request Item
      {
        "type": "message_request",
        "id": "req-id-123",
        "requestId": "req-id-123",
        "senderInfo": {
          "id": "user-456",
          "fullName": "John Doe",
          "avatar": "https://..."
        },
        "firstMessage": "Hey, want to chat?",
        "presetMessage": "Let's connect",
        "status": "PENDING",
        "createdAt": "2024-01-15T10:00:00Z",
        "expiresAt": "2024-02-14T10:00:00Z",
        "isExpired": false,
        "actions": {
          "acceptUrl": "/chat/message-requests/req-id-123/accept",
          "declineUrl": "/chat/message-requests/req-id-123/decline",
          "blockUrl": "/chat/message-requests/req-id-123/block"
        }
      },
      
      // Type 2: Chat Room Item
      {
        "type": "chat_room",
        "id": "room-789",
        "roomId": "room-789",
        "participantInfo": {
          "id": "user-999",
          "fullName": "Jane Smith",
          "avatar": "https://..."
        },
        "latestMessage": {
          "id": "msg-001",
          "message": "See you tomorrow!",
          "type": "TEXT",
          "isRead": true,
          "isDelivered": true,
          "createdAt": "2024-01-15T09:30:00Z",
          "sender": {
            "id": "user-999",
            "fullName": "Jane Smith"
          }
        },
        "unreadCount": 0,
        "lastMessageAt": "2024-01-15T09:30:00Z"
      },
      
      // More items...
    ],
    "stats": {
      "totalRooms": 5,
      "totalPendingRequests": 3,
      "totalUnreadMessages": 2,
      "totalBlockedUsers": 1
    },
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 8,
      "totalPages": 1,
      "hasNextPage": false
    }
  }
}
```

---

## WebSocket Event Flow

### User A Accepts Message Request from User B

```
User A (Receiver)                Backend               User B (Sender)
                                  │
Accept Request ───────────────→   │
   POST /message-requests/{id}/accept
                                  │
                ┌─────────────────┴─────────────────┐
                │                                   │
       Create ChatRoom            Emit Events      │
         & Update Status            │              │
                │                   ├─→ WebSocket: "message-request-accepted"
                │                   │   (to User A)
                │                   │
                │                   └─→ WebSocket: "message-request-accepted-by-receiver"
                │                       (to User B)
                │                   
                └─→ Emit to both: "chat-list-refresh"
                                  
                ↓
Frontend hears "chat-list-refresh"
   │
   ├─→ Call GET /chat/list
   │
   └─→ Request disappears from pending
       Chat room appears in active chats
```

### User B Rejects Message Request from User A

```
User B (Receiver)                Backend               User A (Sender)
                                  │
Reject Request ───────────────→   │
   POST /message-requests/{id}/reject
                                  │
                Update Status    │
                to REJECTED        │
                                  │
                ┌─────────────────┴─────────────────┐
                │                                   │
        Emit to User A:                    Do Nothing
        "message-request-rejected"
                                      (No list refresh for User B)
                │
                └─→ User A's list auto-refreshes
                    Request marked as REJECTED
```

---

## Message Request Lifecycle

```
                    PENDING
                      ↓
            ┌─────────┴─────────┐
            ↓                   ↓
        ACCEPTED            REJECTED
           ↓
       ChatRoom Created
           ↓
    Active Chat Available


Timeline:
Created ────→ 7 days ────→ 14 days ────→ 30 days ────→ Auto-Declined
            Can respond    Still pending  Expires      (cleanup)
```

---

## Performance Considerations

### Query Optimization
```typescript
// Efficient parallel queries
const [rooms, requests, blockedUsers] = await Promise.all([
  // Index on: (user1_id, is_deleted), (user2_id, is_deleted)
  chatRoomModel.find({ $or: [{ user1_id }, { user2_id }] }),
  
  // Index on: (receiverId, status, createdAt)
  messageRequestModel.find({ receiverId, status: 'PENDING', createdAt: { $gte } }),
  
  // Index on: user_id
  blockListModel.find({ $or: [{ user_id }, { blocked_user_id }] })
]);
```

### Database Indexes Required
```javascript
// ChatRoom indexes
db.chatroom.createIndex({ user1_id: 1, is_deleted: 1 });
db.chatroom.createIndex({ user2_id: 1, is_deleted: 1 });
db.chatroom.createIndex({ updatedAt: -1 }); // For sorting

// Chat (messages) indexes
db.chat.createIndex({ chatRoom_id: 1, is_read: 1, receiver_id: 1 });
db.chat.createIndex({ chatRoom_id: 1, createdAt: -1 });

// MessageRequest indexes
db.messagerequest.createIndex({ receiverId: 1, status: 1, createdAt: -1 });
db.messagerequest.createIndex({ senderId: 1, receiverId: 1 }); // Unique constraint

// BlockList indexes
db.blocklist.createIndex({ user_id: 1 });
db.blocklist.createIndex({ blocked_user_id: 1 });
```

---

## Error Handling Matrix

| Scenario | Status | Response | Frontend Action |
|----------|--------|----------|---|
| Request expired (30+ days) | 410 Gone | `{ message: "Request expired" }` | Remove from list, show toast |
| User blocked sender | 403 Forbidden | `{ message: "User is blocked" }` | Show error, hide action buttons |
| Accept when already accepted | 409 Conflict | `{ data: { room }, message: "Already accepted" }` | Redirect to chat room |
| Reject own sent request | 400 Bad Request | `{ message: "Cannot reject own request" }` | Decline instead |
| Network timeout | N/A | Retry | Show retry UI |
| Concurrent accepts | 409 Conflict | `{ message: "Request already processed" }` | Refresh list |

---

## Filtering & Sorting Examples

### Filtering
```
/chat/list?filter=all        // Requests + Chats
/chat/list?filter=active     // Chats only
/chat/list?filter=pending    // Requests only
/chat/list?filter=requests   // Requests only (alias)
```

### Sorting
```
/chat/list?sort=recent   // Latest first (by lastMessageAt or createdAt)
/chat/list?sort=unread   // Requests first, then rooms with unread, then read
/chat/list?sort=alpha    // By participant name A-Z
```

### Pagination
```
/chat/list?page=1&limit=20   // Items 1-20
/chat/list?page=2&limit=20   // Items 21-40
/chat/list?page=3&limit=20   // Items 41-60
```

---

## Integration Timeline

```
Week 1:
├── Day 1-2: Backend DTOs + Service (6 hours)
├── Day 2-3: Controller + WebSocket (2 hours)
├── Day 4: Testing & fixes (3 hours)
└── Day 5: Code review & deploy staging

Week 2:
├── Day 1-2: Frontend Service (3 hours)
├── Day 2-3: Component + Template (5 hours)
├── Day 4: Styling + Integration (3 hours)
└── Day 5: Testing & QA (2 hours)

Total: ~20 hours development + testing
```

---

## Success Criteria

✅ Single `/chat/list` endpoint returns both types
✅ Sorting works consistently across items
✅ Filtering correctly separates active/pending
✅ Unread counts accurate
✅ WebSocket events trigger list refresh
✅ Accept request creates ChatRoom instantly
✅ Reject request prevents future messages
✅ Block user prevents all communication
✅ Pagination handles mixed item types
✅ Frontend renders without errors
✅ Backward compatibility maintained

---

## Future Enhancements

1. **Request Preview Modal** - Show thread without accepting
2. **Message Request Expiration** - Auto-cleanup after 30 days
3. **Smart Notifications** - Group multiple requests from same user
4. **Request Templates** - Pre-written common openers
5. **Search & Filter** - Full-text search on messages
6. **Archive Chats** - Hide inactive conversations
7. **Pin Chats** - Keep important chats at top
8. **Read Status** - Track if request was viewed
9. **Request Analytics** - Track response rates
10. **Typing Indicators** - Show "typing..." before acceptance

