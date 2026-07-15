const MONGO_ID_REGEX = /^[0-9a-fA-F]{24}$/;

export const MONGO_ID_FIELD_NAMES = new Set([
  "id",
  "_id",
  "userId",
  "user_id",
  "blockedUserId",
  "blocked_user_id",
  "otherUserId",
  "raterId",
  "rater_id",
  "rateeId",
  "ratee_id",
  "senderId",
  "sender_id",
  "receiverId",
  "receiver_id",
  "roomId",
  "room_id",
  "chatRoomId",
  "chatRoom_id",
  "groupChatRoomId",
  "groupChatRoom_id",
  "memberId",
  "memberIds",
  "newMemberId",
  "newMemberIds",
  "messageId",
  "messageIds",
  "lastReadMessageId",
  "last_read_message_id",
  "presetMessageId",
  "senderKeyId",
  "receiverKeyId",
  "requestId",
  "ratingId",
  "ticketId",
  "documentId",
  "spotId",
  "parkingReportId",
  "parking_report_id",
  "handoffId",
  "sessionId",
  "areaId",
  "eventId",
  "deletedById",
  "createdById",
  "releaserId",
  "seekerId",
]);

export function isValidMongoId(value: unknown): value is string {
  return typeof value === "string" && MONGO_ID_REGEX.test(value);
}

export function isMongoIdFieldName(field: string) {
  return MONGO_ID_FIELD_NAMES.has(field);
}

export function collectMongoIdValidationErrors(value: unknown, path = ""): string[] {
  const errors: string[] = [];

  validateObject(value, path, errors);

  return errors;
}

export function collectMongoIdValueValidationErrors(field: string, value: unknown): string[] {
  const errors: string[] = [];

  validateFieldValue(field, value, errors);

  return errors;
}

function validateObject(value: unknown, path: string, errors: string[]) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => validateObject(item, `${path}[${index}]`, errors));
    return;
  }

  if (!isObject(value)) {
    return;
  }

  Object.entries(value).forEach(([key, item]) => {
    const fieldPath = path ? `${path}.${key}` : key;

    if (isMongoIdFieldName(key)) {
      validateFieldValue(fieldPath, item, errors);
      return;
    }

    validateObject(item, fieldPath, errors);
  });
}

function validateFieldValue(field: string, value: unknown, errors: string[]) {
  if (value === undefined || value === null) {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => validateSingleId(`${field}[${index}]`, item, errors));
    return;
  }

  if (typeof value === "string" && isPluralField(field)) {
    parseStringList(value).forEach((item, index) => validateSingleId(`${field}[${index}]`, item, errors));
    return;
  }

  validateSingleId(field, value, errors);
}

function validateSingleId(field: string, value: unknown, errors: string[]) {
  if (!isValidMongoId(value)) {
    errors.push(`${field} must be a valid MongoDB ObjectId`);
  }
}

function parseStringList(value: string): unknown[] {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return [value];
  }

  if (trimmedValue.startsWith("[")) {
    try {
      const parsedValue = JSON.parse(trimmedValue);
      return Array.isArray(parsedValue) ? parsedValue : [value];
    } catch {
      return [value];
    }
  }

  return trimmedValue.split(",").map((item) => item.trim());
}

function isPluralField(field: string) {
  const fieldName = field.split(".").pop() ?? field;
  return fieldName.endsWith("Ids") || fieldName.endsWith("_ids");
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
