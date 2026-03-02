export enum EMIT_EVENTS  {
    NEW_MESSAGE = "new-message",

    MESSAGE_SENT = "message-sent",
    MESSAGE_DELIVERED = "message-delivered",
    MESSAGE_READ = "message-read",

    ALL_CHAT_ROOMS = "all-chat-rooms",
    ALL_MESSAGES = "all-messages",
    SUCCESS = "success",
    ERROR = "error"

}

export enum SUBSCRIBED_EVENTS {
    FETCH_CHAT_ROOMS = "fetch-chat-rooms",
    MESSAGE  = "message",
    FETCH_MESSAGES = "fetch-messages",
    SEND_FILE = "send-file",

    MESSAGE_RECEIVED = "message-received",
}