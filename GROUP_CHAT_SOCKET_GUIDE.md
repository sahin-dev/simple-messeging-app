# Group Chat Socket Implementation Guide

## Overview
This document provides complete implementation details for the group chat features in the socket gateway. These features enable real-time group messaging with member management, typing indicators, and group notifications.

---

## Socket Events Reference

### Emit Events (Server → Client)

| Event | Payload | Purpose |
|-------|---------|---------|
| `group-message-sent` | `{ ...message, is_mine: true }` | Confirm message sent to sender |
| `group-new-message` | `{ ...message, is_mine: boolean, groupChatRoomId }` | Broadcast new message to group |
| `group-chat-rooms` | `{ rooms, total }` | Send paginated group rooms to user |
| `group-messages` | `{ messages, total }` | Send paginated group messages |
| `group-member-added` | `{ message, newMember, groupChatRoomId }` | Notify when member added |
| `group-member-removed` | `{ message, memberId, removedBy, groupChatRoomId }` | Notify when member removed |
| `group-updated` | `{ message, updatedGroup, updatedBy, groupChatRoomId }` | Notify group info update |
| `group-user-typing` | `{ userId, groupChatRoomId }` | Broadcast typing indicator |
| `group-user-stopped-typing` | `{ userId, groupChatRoomId }` | Broadcast stopped typing |
| `success` | `{ message, groupChat? }` | General success event |
| `error` | `{ message }` | Error event |

### Subscribe Events (Client → Server)

#### 1. Create Group Chat
```typescript
socket.emit('create-group-chat', {
  name: string;                    // Group name (required)
  image?: string;                   // Group image URL (optional)
  memberIds: string[];              // Array of member user IDs (required)
})
```
**Response:** `success` event with created group details
**Notes:** Creator automatically becomes GROUP_ADMIN

#### 2. Send Group Message
```typescript
socket.emit('send-group-message', {
  groupChatRoomId: string;         // Group ID (required)
  message: string;                  // Message text (required)
})
```
**Response:** `group-message-sent` event (to sender) + `group-new-message` (to all members)
**Notes:** Automatically stops typing indicator

#### 3. Join Group Chat
```typescript
socket.emit('join-group-chat', {
  groupChatRoomId: string;         // Group ID to join
})
```
**Response:** `success` event confirming join + notification to all members

#### 4. Leave Group Chat
```typescript
socket.emit('leave-group-chat', {
  groupChatRoomId: string;         // Group ID to leave
})
```
**Response:** `success` event confirming leave + notification to remaining members

#### 5. Fetch Group Chat Rooms
```typescript
socket.emit('fetch-group-chat-rooms', {
  page?: number;                    // Page number (default: 1)
  limit?: number;                   // Items per page (default: 10)
})
```
**Response:** `group-chat-rooms` event with paginated rooms
**Notes:** Automatically joins all socket rooms for received groups

#### 6. Fetch Group Messages
```typescript
socket.emit('fetch-group-messages', {
  groupChatRoomId: string;         // Group ID
  pagination: {
    page?: number;                  // Page number (default: 1)
    limit?: number;                 // Items per page (default: 10)
  }
})
```
**Response:** `group-messages` event with paginated messages

#### 7. Add Group Member
```typescript
socket.emit('add-group-member', {
  groupChatRoomId: string;         // Group ID
  newMemberId: string;              // User ID to add
})
```
**Response:** `success` event to requester + `group-member-added` to all group members
**Permissions:** GROUP_ADMIN only

#### 8. Remove Group Member
```typescript
socket.emit('remove-group-member', {
  groupChatRoomId: string;         // Group ID
  memberId: string;                 // User ID to remove
})
```
**Response:** `success` event to requester + `group-member-removed` to all group members
**Permissions:** GROUP_ADMIN can remove any member; users can remove themselves

#### 9. Update Group Chat
```typescript
socket.emit('update-group-chat', {
  groupChatRoomId: string;         // Group ID
  updateData: {
    name?: string;                  // New group name
    image?: string;                 // New group image URL
  }
})
```
**Response:** `success` event to requester + `group-updated` to all members
**Permissions:** GROUP_ADMIN only

#### 10. Group Typing Indicator
```typescript
socket.emit('group-typing', {
  groupChatRoomId: string;         // Group ID
})
```
**Response:** `group-user-typing` event broadcast to all group members
**Notes:** Fire this while user is typing (e.g., every keystroke)

#### 11. Group Stop Typing
```typescript
socket.emit('group-stop-typing', {
  groupChatRoomId: string;         // Group ID
})
```
**Response:** `group-user-stopped-typing` event broadcast to all group members
**Notes:** Fire this when user stops typing or sends message

---

## Client Implementation Examples

### Initialize Connection
```typescript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000', {
  query: {
    userId: 'user-id-here'  // User ID required for authentication
  }
});

socket.on('success', (data) => {
  console.log('Connected:', data);
});
```

### Create Group Chat
```typescript
socket.emit('create-group-chat', {
  name: 'Project Team',
  image: 'https://...',
  memberIds: ['user-1', 'user-2', 'user-3']
});

socket.on('success', (data) => {
  if (data.groupChat) {
    console.log('Group created:', data.groupChat);
  }
});
```

### Send Message
```typescript
socket.emit('send-group-message', {
  groupChatRoomId: 'group-id',
  message: 'Hello team!'
});

socket.on('group-message-sent', (message) => {
  console.log('Message sent:', message);
});
```

### Real-time Message Receiving
```typescript
socket.on('group-new-message', (message) => {
  console.log('New message:', message);
  // Update UI with new message
});
```

### Typing Indicators
```typescript
let typingTimeout;

// When user starts typing
inputElement.addEventListener('input', () => {
  socket.emit('group-typing', { groupChatRoomId });
  
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    socket.emit('group-stop-typing', { groupChatRoomId });
  }, 3000);
});

// When user stops typing
socket.on('group-user-typing', (data) => {
  console.log(`${data.userId} is typing...`);
});

socket.on('group-user-stopped-typing', (data) => {
  console.log(`${data.userId} stopped typing`);
});
```

### Load Group Rooms
```typescript
socket.emit('fetch-group-chat-rooms', {
  page: 1,
  limit: 10
});

socket.on('group-chat-rooms', (response) => {
  console.log('Groups:', response.rooms);
  console.log('Total:', response.total);
});
```

### Load Group Messages
```typescript
socket.emit('fetch-group-messages', {
  groupChatRoomId: 'group-id',
  pagination: { page: 1, limit: 20 }
});

socket.on('group-messages', (response) => {
  console.log('Messages:', response.messages);
  console.log('Total:', response.total);
});
```

### Member Management
```typescript
// Add member
socket.emit('add-group-member', {
  groupChatRoomId: 'group-id',
  newMemberId: 'user-id'
});

// Remove member
socket.emit('remove-group-member', {
  groupChatRoomId: 'group-id',
  memberId: 'user-id'
});

socket.on('group-member-added', (data) => {
  console.log('New member:', data.newMember);
});

socket.on('group-member-removed', (data) => {
  console.log('Member removed:', data.memberId);
});
```

### Update Group Info
```typescript
socket.emit('update-group-chat', {
  groupChatRoomId: 'group-id',
  updateData: {
    name: 'New Group Name',
    image: 'https://...'
  }
});

socket.on('group-updated', (data) => {
  console.log('Group updated:', data.updatedGroup);
});
```

---

## Data Models

### GroupChatRoom
```typescript
{
  id: string;
  name: string;
  image?: string;
  group_members_count: number;
  members: GroupChatRoomMember[];
  chats: GroupChat[];
  createdAt: Date;
  updatedAt: Date;
}
```

### GroupChatRoomMember
```typescript
{
  id: string;
  groupChatRoom_id: string;
  user_id: string;
  group_role: 'GROUP_ADMIN' | 'GROUP_MEMBER';
  user: {
    id: string;
    nick_name: string;
    avatar: string;
  };
  last_read_message_id?: string;
  createdAt: Date;
}
```

### GroupChat (Message)
```typescript
{
  id: string;
  groupChatRoom_id: string;
  sender_id: string;
  message: string;
  sender: {
    id: string;
    nick_name: string;
    avatar: string;
  };
  is_mine: boolean;           // Set by frontend for current user
  createdAt: Date;
}
```

---

## Socket Rooms Architecture

Each group chat uses a socket room with naming convention: `group-{groupChatRoomId}`

When you:
- **Join a group** → User socket joins `group-{id}` room
- **Leave a group** → User socket leaves `group-{id}` room
- **Fetch group rooms** → User automatically joins all group rooms
- **Send message** → Message broadcast to `group-{id}` room
- **Update group** → Update broadcast to `group-{id}` room
- **Add/Remove member** → Notification sent to `group-{id}` room

---

## Error Handling

All errors are caught and returned as `WsException` with a message property:

```typescript
socket.on('error', (error) => {
  console.error('Socket error:', error.message);
});
```

Common errors:
- `"You are not a member of this group"` - User not in group
- `"Only group admin can add members"` - Permission denied for non-admin
- `"User is already a member of this group"` - Adding existing member
- `"Member not found in this group"` - Removing non-existent member

---

## Best Practices

1. **Typing Indicators**: Emit `group-typing` continuously while typing and `group-stop-typing` after user stops
2. **Message Loading**: Load messages in batches using pagination
3. **Group Subscription**: Always fetch group rooms on app startup to auto-join rooms
4. **Error Handling**: Implement proper error listeners on socket connection
5. **Disconnect Handling**: Clean up socket listeners when component unmounts
6. **Admin-only Operations**: Check user permissions before showing UI for add/remove/update operations

---

## Testing with Postman/WebSocket Client

Example WebSocket URL:
```
ws://localhost:3000?userId=user-id-here
```

Test message format:
```json
{
  "event": "create-group-chat",
  "data": {
    "name": "Test Group",
    "memberIds": ["user-1", "user-2"]
  }
}
```

---

## Integration with Existing Chat

This implementation maintains full compatibility with existing individual chat features:
- `message` - Individual message (unchanged)
- `fetch-chat-rooms` - Individual chat rooms (unchanged)
- `fetch-messages` - Individual chat messages (unchanged)
- `message-received` - Message delivery acknowledgement (unchanged)

---

## Performance Notes

- Typing states are tracked in memory per group
- Socket.io rooms efficiently broadcast to all connected members
- Pagination prevents loading entire message history
- Members auto-join groups on room fetch for better performance
