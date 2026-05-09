# Group Chat Socket Testing Quick Reference

## WebSocket Connection
```
ws://localhost:3000?userId=YOUR_USER_ID
```

---

## Quick Test Commands

### 1. Test Connection
**Event:** (Listen for automatic success event)
```json
No data needed - server sends success on connection
```

---

### 2. Create Group Chat
**Event:** `create-group-chat`
```json
{
  "name": "Project Discussion",
  "image": "https://via.placeholder.com/100",
  "memberIds": ["user-1", "user-2", "user-3"]
}
```
**Expected Response:** `success` event with created group

---

### 3. Fetch Group Rooms
**Event:** `fetch-group-chat-rooms`
```json
{
  "page": 1,
  "limit": 10
}
```
**Expected Response:** `group-chat-rooms` event with rooms array

---

### 4. Join Group Chat
**Event:** `join-group-chat`
```json
{
  "groupChatRoomId": "COPY_GROUP_ID_FROM_CREATE_RESPONSE"
}
```
**Expected Response:** `success` event

---

### 5. Send Group Message
**Event:** `send-group-message`
```json
{
  "groupChatRoomId": "COPY_GROUP_ID",
  "message": "Hello team! This is a test message"
}
```
**Expected Response:** 
- `group-message-sent` (to sender)
- `group-new-message` (to all members in room)

---

### 6. Fetch Group Messages
**Event:** `fetch-group-messages`
```json
{
  "groupChatRoomId": "COPY_GROUP_ID",
  "pagination": {
    "page": 1,
    "limit": 20
  }
}
```
**Expected Response:** `group-messages` event with messages array

---

### 7. Add Group Member
**Event:** `add-group-member`
```json
{
  "groupChatRoomId": "COPY_GROUP_ID",
  "newMemberId": "new-user-id-to-add"
}
```
**Expected Response:** 
- `success` (to requester)
- `group-member-added` (to all members)
- `success` notification (to new member)

---

### 8. Remove Group Member
**Event:** `remove-group-member`
```json
{
  "groupChatRoomId": "COPY_GROUP_ID",
  "memberId": "user-id-to-remove"
}
```
**Expected Response:**
- `success` (to requester)
- `group-member-removed` (to all members)
- `success` notification (to removed member)

---

### 9. Update Group Info
**Event:** `update-group-chat`
```json
{
  "groupChatRoomId": "COPY_GROUP_ID",
  "updateData": {
    "name": "Updated Group Name",
    "image": "https://via.placeholder.com/150"
  }
}
```
**Expected Response:**
- `success` (to requester)
- `group-updated` (to all members)

---

### 10. User Typing Indicator
**Event:** `group-typing`
```json
{
  "groupChatRoomId": "COPY_GROUP_ID"
}
```
**Expected Response:** `group-user-typing` event (to all members)

---

### 11. Stop Typing Indicator
**Event:** `group-stop-typing`
```json
{
  "groupChatRoomId": "COPY_GROUP_ID"
}
```
**Expected Response:** `group-user-stopped-typing` event (to all members)

---

### 12. Leave Group Chat
**Event:** `leave-group-chat`
```json
{
  "groupChatRoomId": "COPY_GROUP_ID"
}
```
**Expected Response:**
- `success` (to requester)
- Notification (to remaining members)

---

## Testing Workflow

### Step 1: Create a test group
1. Send `create-group-chat` with 2-3 test user IDs
2. Copy the `id` from the response

### Step 2: Verify group creation
1. Send `fetch-group-chat-rooms` from one account
2. Confirm the group appears in the list

### Step 3: Send messages
1. Send `send-group-message` with test message
2. Listen for `group-new-message` event on all member connections

### Step 4: Test member management
1. Send `add-group-member` with new user ID
2. Send `remove-group-member` with user ID

### Step 5: Test typing indicators
1. Send `group-typing` event
2. Listen for `group-user-typing` on other connections
3. Send `group-stop-typing` to stop

### Step 6: Test message history
1. Send `fetch-group-messages` with pagination
2. Verify pagination works correctly

---

## Multi-Client Testing

To test real-time features with multiple users:

1. **Open multiple WebSocket connections** in separate browser tabs/windows
2. **Use different user IDs** in each connection query parameter
3. **Send events from one client** and observe events on others
4. **Verify broadcasting** - messages should appear on all connected clients

Example URLs for multiple tabs:
```
Tab 1: ws://localhost:3000?userId=user-1
Tab 2: ws://localhost:3000?userId=user-2
Tab 3: ws://localhost:3000?userId=user-3
```

---

## Console Testing (Browser DevTools)

```typescript
// In browser console, assuming socket variable is available:

// Send message
socket.emit('send-group-message', {
  groupChatRoomId: 'group-123',
  message: 'Test message'
});

// Listen for all events
socket.onAny((event, ...args) => {
  console.log(`Event: ${event}`, args);
});

// Listen for specific events
socket.on('group-new-message', (data) => {
  console.log('New message:', data);
});
```

---

## Common Issues & Fixes

| Issue | Solution |
|-------|----------|
| "You are not a member of this group" | Make sure user ID is in memberIds when creating group |
| Empty group rooms response | Ensure user has joined groups first by fetching rooms |
| Typing indicators not showing | Make sure to send both `group-typing` AND `group-stop-typing` |
| Messages not broadcasting | Verify all members are in the same group via `fetch-group-messages` |
| Permission denied on add/remove | Only GROUP_ADMIN can add/remove members; creator is auto-admin |

---

## Debugging Tips

1. **Check browser console** for WebSocket errors
2. **Monitor Network tab** in DevTools for WebSocket messages
3. **Verify user IDs** are consistent across requests
4. **Check group IDs** are copied correctly from responses
5. **Enable verbose logging** in server to see socket event flow
6. **Test with curl** if needed (though WebSocket requires special handling)

---

## Production Checklist

- [ ] Update CORS origin to production URL (currently: `http://10.10.20.44:3000`)
- [ ] Add proper error handling on client side
- [ ] Implement reconnection logic
- [ ] Add authentication token to WebSocket handshake
- [ ] Monitor socket connections and memory usage
- [ ] Set up proper logging infrastructure
- [ ] Test with realistic message volume
- [ ] Implement rate limiting for WebSocket events
- [ ] Add message persistence for offline users
- [ ] Implement read receipts (optional enhancement)
