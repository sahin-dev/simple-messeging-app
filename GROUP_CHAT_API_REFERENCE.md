# Group Chat Socket Events - Quick API Reference

## Emit (Server → Client) - Listen for these events

| Event | Payload | When |
|-------|---------|------|
| `group-message-sent` | `{ id, sender_id, message, is_mine: true }` | Message confirmed sent |
| `group-new-message` | `{ id, sender_id, message, is_mine, groupChatRoomId }` | New message received |
| `group-chat-rooms` | `{ rooms: [], total: number }` | Rooms data fetched |
| `group-messages` | `{ messages: [], total: number }` | Messages data fetched |
| `group-member-added` | `{ newMember, groupChatRoomId }` | Member added to group |
| `group-member-removed` | `{ memberId, removedBy, groupChatRoomId }` | Member removed |
| `group-updated` | `{ updatedGroup, updatedBy, groupChatRoomId }` | Group info changed |
| `group-user-typing` | `{ userId, groupChatRoomId }` | User is typing |
| `group-user-stopped-typing` | `{ userId, groupChatRoomId }` | User stopped typing |
| `success` | `{ message, groupChat?, ... }` | Operation successful |
| `error` | `{ message }` | Operation failed |

---

## Subscribe (Client → Server) - Emit these events

### Create Group
```
Event: 'create-group-chat'
Data: {
  name: string;           // Required
  image?: string;         // Optional
  memberIds: string[];    // Required
}
Response: success event with created group
```

### Send Message
```
Event: 'send-group-message'
Data: {
  groupChatRoomId: string;  // Required
  message: string;           // Required
}
Response: group-message-sent (sender) + group-new-message (group)
```

### Join Group
```
Event: 'join-group-chat'
Data: {
  groupChatRoomId: string;  // Required
}
Response: success event
```

### Leave Group
```
Event: 'leave-group-chat'
Data: {
  groupChatRoomId: string;  // Required
}
Response: success event
```

### Fetch Groups
```
Event: 'fetch-group-chat-rooms'
Data: {
  page?: number;     // Default: 1
  limit?: number;    // Default: 10
}
Response: group-chat-rooms event
```

### Fetch Messages
```
Event: 'fetch-group-messages'
Data: {
  groupChatRoomId: string;  // Required
  pagination: {
    page?: number;          // Default: 1
    limit?: number;         // Default: 10
  }
}
Response: group-messages event
```

### Add Member (Admin Only)
```
Event: 'add-group-member'
Data: {
  groupChatRoomId: string;  // Required
  newMemberId: string;      // Required
}
Response: success + group-member-added (broadcast)
```

### Remove Member (Admin/Self Only)
```
Event: 'remove-group-member'
Data: {
  groupChatRoomId: string;  // Required
  memberId: string;         // Required
}
Response: success + group-member-removed (broadcast)
```

### Update Group (Admin Only)
```
Event: 'update-group-chat'
Data: {
  groupChatRoomId: string;  // Required
  updateData: {
    name?: string;          // Optional
    image?: string;         // Optional
  }
}
Response: success + group-updated (broadcast)
```

### Typing
```
Event: 'group-typing'
Data: {
  groupChatRoomId: string;  // Required
}
Response: group-user-typing (broadcast)
Use: Emit while user types
```

### Stop Typing
```
Event: 'group-stop-typing'
Data: {
  groupChatRoomId: string;  // Required
}
Response: group-user-stopped-typing (broadcast)
Use: Emit when user stops typing or sends message
```

---

## React Implementation Example

```typescript
import { useEffect, useState } from 'react';
import io from 'socket.io-client';

export function GroupChat({ userId, groupId }) {
  const [socket, setSocket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isTyping, setIsTyping] = useState(false);

  useEffect(() => {
    const newSocket = io('http://localhost:3000', {
      query: { userId }
    });

    newSocket.on('connect', () => {
      newSocket.emit('join-group-chat', { groupChatRoomId: groupId });
      newSocket.emit('fetch-group-messages', {
        groupChatRoomId: groupId,
        pagination: { page: 1, limit: 20 }
      });
    });

    newSocket.on('group-messages', (data) => {
      setMessages(data.messages);
    });

    newSocket.on('group-new-message', (message) => {
      setMessages(prev => [message, ...prev]);
    });

    setSocket(newSocket);
    return () => newSocket.close();
  }, [userId, groupId]);

  const sendMessage = (text) => {
    socket?.emit('send-group-message', {
      groupChatRoomId: groupId,
      message: text
    });
  };

  const handleTyping = () => {
    if (!isTyping) {
      socket?.emit('group-typing', { groupChatRoomId: groupId });
      setIsTyping(true);
      setTimeout(() => {
        socket?.emit('group-stop-typing', { groupChatRoomId: groupId });
        setIsTyping(false);
      }, 3000);
    }
  };

  return (
    <div>
      <div className="messages">
        {messages.map(msg => (
          <div key={msg.id} className={msg.is_mine ? 'my-message' : 'other-message'}>
            {msg.message}
          </div>
        ))}
      </div>
      <input
        onKeyPress={(e) => {
          handleTyping();
          if (e.key === 'Enter') {
            sendMessage(e.target.value);
            e.target.value = '';
          }
        }}
      />
    </div>
  );
}
```

---

## Vue 3 Implementation Example

```vue
<template>
  <div class="group-chat">
    <div class="messages">
      <div
        v-for="msg in messages"
        :key="msg.id"
        :class="{ 'my-message': msg.is_mine }"
      >
        {{ msg.message }}
      </div>
    </div>
    <input
      @keydown.enter="sendMessage"
      @input="handleTyping"
      v-model="messageText"
      placeholder="Type a message..."
    />
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import io from 'socket.io-client';

const props = defineProps(['userId', 'groupId']);
const socket = ref(null);
const messages = ref([]);
const messageText = ref('');
let typingTimeout;

onMounted(() => {
  socket.value = io('http://localhost:3000', {
    query: { userId: props.userId }
  });

  socket.value.on('connect', () => {
    socket.value.emit('join-group-chat', { groupChatRoomId: props.groupId });
  });

  socket.value.on('group-new-message', (msg) => {
    messages.value.unshift(msg);
  });

  socket.value.on('group-messages', (data) => {
    messages.value = data.messages;
  });
});

onUnmounted(() => {
  socket.value?.close();
});

const sendMessage = () => {
  if (messageText.value.trim()) {
    socket.value.emit('send-group-message', {
      groupChatRoomId: props.groupId,
      message: messageText.value
    });
    messageText.value = '';
  }
};

const handleTyping = () => {
  socket.value.emit('group-typing', { groupChatRoomId: props.groupId });
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    socket.value.emit('group-stop-typing', { groupChatRoomId: props.groupId });
  }, 1500);
};
</script>
```

---

## Error Handling

```typescript
socket.on('error', (error) => {
  console.error('Socket error:', error.message);
  
  // Common errors:
  if (error.message.includes('not a member')) {
    // User is not in group
  } else if (error.message.includes('Only group admin')) {
    // Permission denied
  } else if (error.message.includes('already a member')) {
    // Member exists
  }
});
```

---

## Connection Setup

```typescript
const socket = io('ws://localhost:3000', {
  query: {
    userId: 'user-123'  // Required for authentication
  },
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: 5
});

socket.on('connect', () => {
  console.log('Connected to socket');
});

socket.on('disconnect', () => {
  console.log('Disconnected from socket');
});

socket.on('error', (error) => {
  console.error('Connection error:', error);
});
```

---

## Browser Console Testing

```javascript
// Create group
socket.emit('create-group-chat', {
  name: 'Test Group',
  memberIds: ['user-1', 'user-2']
});

// Send message
socket.emit('send-group-message', {
  groupChatRoomId: 'group-id',
  message: 'Hello!'
});

// Listen to all events
socket.onAny((event, data) => {
  console.log(`[${event}]`, data);
});
```

---

## Performance Tips

1. **Debounce typing events** - Don't emit every keystroke
2. **Paginate messages** - Load 20-50 at a time, not all
3. **Clean up listeners** - Unsubscribe when component unmounts
4. **Use socket rooms** - Broadcast instead of individual sends
5. **Implement reconnection** - Handle network interruptions
6. **Compress data** - For large message payloads
