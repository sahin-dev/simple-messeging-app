import { IsNumber, IsNotEmpty, IsOptional, IsString, IsBoolean, Min, Max } from 'class-validator';

export class SendLocationNotificationDto {
  @IsNumber()
  @IsNotEmpty()
  @Min(-90)
  @Max(90)
  latitude: number;

  @IsNumber()
  @IsNotEmpty()
  @Min(-180)
  @Max(180)
  longitude: number;

  @IsNumber()
  @IsNotEmpty()
  @Min(0.1)
  @Max(100)
  radiusInKm: number; // Radius in kilometers (will be converted to meters)

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  message: string;

  @IsOptional()
  @IsString()
  emailSubject?: string;

  @IsOptional()
  @IsBoolean()
  sendEmail: boolean = true;

  @IsOptional()
  @IsBoolean()
  sendPushNotification: boolean = true;
}

export class LocationNotificationResponse {
  success: boolean;
  totalUsersFound: number;
  notificationsSent: number;
  emailsSent: number;
  failedCount: number;
  message: string;
}
