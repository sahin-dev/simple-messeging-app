export enum EMIT_EVENTS  {
    NEW_MESSAGE = "new-message",

    MESSAGE_SENT = "message-sent",
    MESSAGE_REQUEST = "message-request",
    MESSAGE_REQUEST_SENT = "message-request-sent",
    MESSAGE_REQUEST_ACCEPTED = "message-request-accepted",
    MESSAGE_DELIVERED = "message-delivered",
    MESSAGE_READ = "message-read",
    MESSAGE_DELETED = "message-deleted",
    USER_TYPING = "user-typing",
    USER_STOPPED_TYPING = "user-stopped-typing",
    USER_ONLINE = "user-online",
    USER_OFFLINE = "user-offline",

    ALL_CHAT_ROOMS = "all-chat-rooms",
    ALL_MESSAGES = "all-messages",
    SUCCESS = "success",
    ERROR = "error",

    // Group Chat Events
    GROUP_MESSAGE_SENT = "group-message-sent",
    GROUP_NEW_MESSAGE = "group-new-message",
    GROUP_CHAT_ROOMS = "group-chat-rooms",
    GROUP_MESSAGES = "group-messages",
    GROUP_MEMBER_ADDED = "group-member-added",
    GROUP_MEMBERS_ADDED = "group-members-added",
    GROUP_MEMBER_REMOVED = "group-member-removed",
    GROUP_UPDATED = "group-updated",
    GROUP_MESSAGE_DELETED = "group-message-deleted",
    GROUP_USER_TYPING = "group-user-typing",
    GROUP_USER_STOPPED_TYPING = "group-user-stopped-typing",
}

export enum SUBSCRIBED_EVENTS {
    FETCH_CHAT_ROOMS = "fetch-chat-rooms",
    MESSAGE  = "message",
    FETCH_MESSAGES = "fetch-messages",
    SEND_FILE = "send-file",

    MESSAGE_RECEIVED = "message-received",
    TYPING = "typing",
    STOP_TYPING = "stop-typing",

    // Group Chat Events
    CREATE_GROUP_CHAT = "create-group-chat",
    SEND_GROUP_MESSAGE = "send-group-message",
    JOIN_GROUP_CHAT = "join-group-chat",
    LEAVE_GROUP_CHAT = "leave-group-chat",
    FETCH_GROUP_CHAT_ROOMS = "fetch-group-chat-rooms",
    FETCH_GROUP_MESSAGES = "fetch-group-messages",
    ADD_GROUP_MEMBER = "add-group-member",
    ADD_GROUP_MEMBERS = "add-group-members",
    REMOVE_GROUP_MEMBER = "remove-group-member",
    UPDATE_GROUP_CHAT = "update-group-chat",
    GROUP_TYPING = "group-typing",
    GROUP_STOP_TYPING = "group-stop-typing",
}
