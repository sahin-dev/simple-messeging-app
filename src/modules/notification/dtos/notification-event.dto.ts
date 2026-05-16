import { IsString, IsNotEmpty, IsOptional, IsObject, IsEnum, IsNumber, IsBoolean } from 'class-validator';

export enum NotificationEventTypeEnum {
  PARKING_AVAILABLE = 'PARKING_AVAILABLE',
  PARKING_NEARBY = 'PARKING_NEARBY',
  CHAT_MESSAGE = 'CHAT_MESSAGE',
  CHAT_DELIVERED = 'CHAT_DELIVERED',
  CHAT_READ = 'CHAT_READ',
  RATING_RECEIVED = 'RATING_RECEIVED',
  GROUP_CHAT_MESSAGE = 'GROUP_CHAT_MESSAGE',
  GROUP_CHAT_ADDED = 'GROUP_CHAT_ADDED',
  GROUP_CHAT_REMOVED = 'GROUP_CHAT_REMOVED',
  SYSTEM_NOTIFICATION = 'SYSTEM_NOTIFICATION',
  USER_MENTION = 'USER_MENTION',
  PARKING_EXPIRING_SOON = 'PARKING_EXPIRING_SOON',
  DOCUMENT_EXPIRING_SOON = 'DOCUMENT_EXPIRING_SOON',
  DOCUMENT_EXPIRED = 'DOCUMENT_EXPIRED',
}

export class CreateNotificationEventDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsEnum(NotificationEventTypeEnum)
  @IsNotEmpty()
  eventType: NotificationEventTypeEnum;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  message: string;

  @IsOptional()
  @IsObject()
  payload?: Record<string, any>;
}

export class UpdateNotificationPreferenceDto {
  @IsOptional()
  @IsBoolean()
  parkingNotifications?: boolean;

  @IsOptional()
  @IsBoolean()
  chatNotifications?: boolean;

  @IsOptional()
  @IsBoolean()
  ratingNotifications?: boolean;

  @IsOptional()
  @IsBoolean()
  groupChatNotifications?: boolean;

  @IsOptional()
  @IsBoolean()
  systemNotifications?: boolean;

  @IsOptional()
  @IsNumber()
  notificationRadius?: number;
}

export class UpdateUserLocationDto {
  @IsNumber()
  @IsNotEmpty()
  latitude: number;

  @IsNumber()
  @IsNotEmpty()
  longitude: number;

  @IsOptional()
  @IsNumber()
  accuracy?: number;
}
