import { IsEnum, IsNotEmpty, IsString, IsDateString, IsMongoId, IsOptional } from 'class-validator';

export enum DocumentTypeEnum {
  LICENSE = 'LICENSE',
  INSURANCE = 'INSURANCE',
  TAX = 'TAX',
  VEHICLE_OWNERSHIP = 'VEHICLE_OWNERSHIP',
  CAR_INSPECTION = 'CAR_INSPECTION',
}

export class UploadUserDocumentDto {
  @IsEnum(DocumentTypeEnum)
  @IsNotEmpty()
  document_type: DocumentTypeEnum;

  @IsString()
  @IsNotEmpty()
  unique_id: string; // Unique ID for the document, provided by user

  @IsDateString()
  @IsNotEmpty()
  expiry_date: string; // ISO date string (YYYY-MM-DD)

  @IsString()
  @IsNotEmpty()
  document_url: string; // URL of the uploaded document
}

export class UploadUserDocumentFileDto {
  @IsEnum(DocumentTypeEnum)
  @IsNotEmpty()
  document_type: DocumentTypeEnum;

  @IsString()
  @IsNotEmpty()
  unique_id: string; // Unique ID for the document, provided by user

  @IsDateString()
  @IsNotEmpty()
  expiry_date: string; // ISO date string (YYYY-MM-DD)
  
  // file is handled by multer, not by class-validator
}

export class UpdateUserDocumentDto {
  @IsString()
  @IsOptional()
  unique_id?: string; // Unique ID for the document, can be updated by user

  @IsString()
  @IsOptional()
  document_url?: string;

  @IsEnum(DocumentTypeEnum)
  @IsNotEmpty()
  @IsOptional()
  document_type?: DocumentTypeEnum;

  @IsDateString()
  @IsOptional()
  expiry_date?: string; // ISO date string (YYYY-MM-DD)
}

export class UpdateUserDocumentFileDto {
  @IsString()
  @IsOptional()
  unique_id?: string; // Unique ID for the document, can be updated by user

  @IsDateString()
  @IsOptional()
  expiry_date?: string; // ISO date string (YYYY-MM-DD)

  @IsEnum(DocumentTypeEnum)
  @IsNotEmpty()
  @IsOptional()
  document_type?: DocumentTypeEnum;
  
  // file is handled by multer, not by class-validator
}

export class UserDocumentResponseDto {
  id: string;
  unique_id: string;
  document_type: string;
  document_url: string;
  expiry_date: string; // ISO date string
  is_verified: boolean;
  isExpired: boolean;
  daysUntilExpiry: number;
}

export class UserDocumentsListDto {
  documents: UserDocumentResponseDto[];
}

export class DocumentExpiryWarningsDto {
  expired: UserDocumentResponseDto[];
  expiring: UserDocumentResponseDto[];
  hasWarnings: boolean;
}
