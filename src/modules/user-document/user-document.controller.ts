import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  HttpException,
  HttpStatus,
  Logger,
  Req,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { randomUUID } from 'crypto';
import { UserDocumentService } from './services/user-document.service';
import { DocumentExpiryCheckService } from './services/document-expiry-check.service';
import {
  UploadUserDocumentDto,
  UploadUserDocumentFileDto,
  UpdateUserDocumentDto,
  UpdateUserDocumentFileDto,
  UserDocumentResponseDto,
  UserDocumentsListDto,
  DocumentExpiryWarningsDto,
} from './dtos/user-document.dto';
import { ResponseMessage } from '../../common/decorators/apiResponseMessage.decorator';
import { TokenPayload } from '../auth/types/TokenPayload.type';

@Controller('user-documents')
export class UserDocumentController {
  private readonly logger = new Logger(UserDocumentController.name);

  constructor(
    private readonly userDocumentService: UserDocumentService,
    private readonly documentExpiryCheckService: DocumentExpiryCheckService,
  ) {}

  /**
   * Upload a new document for the authenticated user
   * Only one document per type is allowed
   * Document expiry date must be in the future
   * Accepts file upload via multipart/form-data
   */
  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
      storage: diskStorage({
        destination: './uploads/documents',
        filename: (req, file, cb) => {
          const uuid = randomUUID().toString();
          const [fileName, ext] = file.originalname.split('.');
          cb(null, `doc_${uuid}.${ext}`);
        },
      }),
    }),
  )
  @ResponseMessage('Document uploaded successfully')
  async uploadDocument(
    @Req() request: Request,
    @UploadedFile() file: Express.Multer.File,
    @Body() uploadDto: UploadUserDocumentFileDto,
  ): Promise<UserDocumentResponseDto> {
    try {
      if (!file) {
        throw new BadRequestException('No file provided');
      }

      const payload = request['payload'] as TokenPayload;
      this.logger.log(
        `User ${payload.id} uploading ${uploadDto.document_type} document with file: ${file.filename}`,
      );

      // Create the document URL from the uploaded file path
      const documentUrl = `/uploads/documents/${file.filename}`;

      // Create upload DTO with the file URL and unique_id from user
      const fullUploadDto: UploadUserDocumentDto = {
        document_type: uploadDto.document_type,
        unique_id: uploadDto.unique_id,
        expiry_date: uploadDto.expiry_date,
        document_url: documentUrl,
      };

      const document = await this.userDocumentService.uploadDocument(
        payload.id,
        fullUploadDto,
      );

      return {
        id: document.id,
        unique_id: document.unique_id,
        document_type: document.document_type,
        document_url: document.document_url,
        expiry_date: document.expiry_date.toISOString().split('T')[0],
        isExpired: document.expiry_date < new Date(),
        daysUntilExpiry: Math.ceil(
          (document.expiry_date.getTime() - new Date().getTime()) /
            (1000 * 60 * 60 * 24),
        ),
      };
    } catch (err: any) {
      this.logger.error(`Error uploading document: ${err.message}`);
      throw new BadRequestException(
        err.message || 'Failed to upload document',
        err.statusCode || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get all documents for the authenticated user
   * Returns documents sorted by expiry date (ascending)
   */
  @Get()
  @ResponseMessage('Documents retrieved successfully')
  async getUserDocuments(@Req() request: Request): Promise<UserDocumentsListDto> {
    try {
      const payload = request['payload'] as TokenPayload;
      this.logger.log(`Fetching documents for user ${payload.id}`);

      const documents = await this.userDocumentService.getUserDocuments(payload.id);

      const documentsDto = documents.map((doc) => ({
        id: doc.id,
        unique_id: doc.unique_id,
        document_type: doc.document_type,
        document_url: doc.document_url,
        expiry_date: doc.expiry_date.toISOString().split('T')[0],
        isExpired: doc.expiry_date < new Date(),
        daysUntilExpiry: Math.ceil(
          (doc.expiry_date.getTime() - new Date().getTime()) /
            (1000 * 60 * 60 * 24),
        ),
      }));

      return {
        documents: documentsDto,
      };
    } catch (err: any) {
      this.logger.error(`Error fetching documents: ${err.message}`);
      throw new BadRequestException(
        err.message || 'Failed to fetch documents',
        err.statusCode || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get a specific document by ID
   */
  @Get(':documentId')
  @ResponseMessage('Document retrieved successfully')
  async getDocumentById(
    @Req() request: Request,
    @Param('documentId') documentId: string,
  ): Promise<UserDocumentResponseDto> {
    try {
      const payload = request['payload'] as TokenPayload;
      this.logger.log(`Fetching document ${documentId} for user ${payload.id}`);

      const document = await this.userDocumentService.getDocumentById(
        documentId,
        payload.id,
      );

      return {
        id: document.id,
        unique_id: document.unique_id,
        document_type: document.document_type,
        document_url: document.document_url,
        expiry_date: document.expiry_date.toISOString().split('T')[0],
        isExpired: document.expiry_date < new Date(),
        daysUntilExpiry: Math.ceil(
          (document.expiry_date.getTime() - new Date().getTime()) /
            (1000 * 60 * 60 * 24),
        ),
      };
    } catch (err: any) {
      this.logger.error(`Error fetching document: ${err.message}`);
      throw new HttpException(
        err.message || 'Failed to fetch document',
        err.statusCode || HttpStatus.NOT_FOUND,
      );
    }
  }

  /**
   * Get a document by type (LICENSE, INSURANCE, TAX)
   */
  @Get('type/:documentType')
  @ResponseMessage('Document retrieved successfully')
  async getDocumentByType(
    @Req() request: Request,
    @Param('documentType') documentType: string,
  ): Promise<UserDocumentResponseDto> {
    try {
      const payload = request['payload'] as TokenPayload;
      this.logger.log(
        `Fetching ${documentType} document for user ${payload.id}`,
      );

      const document = await this.userDocumentService.getDocumentByType(
        payload.id,
        documentType,
      );

      return {
        id: document.id,
        unique_id: document.unique_id,
        document_type: document.document_type,
        document_url: document.document_url,
        expiry_date: document.expiry_date.toISOString().split('T')[0],
        isExpired: document.expiry_date < new Date(),
        daysUntilExpiry: Math.ceil(
          (document.expiry_date.getTime() - new Date().getTime()) /
            (1000 * 60 * 60 * 24),
        ),
      };
    } catch (err: any) {
      this.logger.error(`Error fetching document by type: ${err.message}`);
      throw new HttpException(
        err.message || 'Document not found',
        err.statusCode || HttpStatus.NOT_FOUND,
      );
    }
  }

  /**
   * Update an existing document
   * Can update expiry_date and/or upload a new file
   */
  @Patch(':documentId')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
      fileFilter: (req, file, cb) => {
        // Allow optional file - don't reject if no file
        cb(null, true);
      },
      storage: diskStorage({
        destination: './uploads/documents',
        filename: (req, file, cb) => {
          const uuid = randomUUID().toString();
          const [fileName, ext] = file.originalname.split('.');
          cb(null, `doc_${uuid}.${ext}`);
        },
      }),
    }),
  )
  @ResponseMessage('Document updated successfully')
  async updateDocument(
    @Req() request: Request,
    @Param('documentId') documentId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() updateDto: UpdateUserDocumentFileDto,
  ): Promise<UserDocumentResponseDto> {
    try {
      const payload = request['payload'] as TokenPayload;
      this.logger.log(`Updating document ${documentId} for user ${payload.id}`);

      // Build the update DTO with file URL if file was uploaded
      let finalUpdateDto: UpdateUserDocumentDto = {};

      if (file) {
        finalUpdateDto.document_url = `/uploads/documents/${file.filename}`;
        this.logger.log(
          `Document ${documentId} updated with new file: ${file.filename}`,
        );
      }

      if (updateDto.unique_id) {
        finalUpdateDto.unique_id = updateDto.unique_id;
      }

      if (updateDto.expiry_date) {
        finalUpdateDto.expiry_date = updateDto.expiry_date;
      }

      const document = await this.userDocumentService.updateDocument(
        documentId,
        payload.id,
        finalUpdateDto,
      );

      return {
        id: document.id,
        unique_id: document.unique_id,
        document_type: document.document_type,
        document_url: document.document_url,
        expiry_date: document.expiry_date.toISOString().split('T')[0],
        isExpired: document.expiry_date < new Date(),
        daysUntilExpiry: Math.ceil(
          (document.expiry_date.getTime() - new Date().getTime()) /
            (1000 * 60 * 60 * 24),
        ),
      };
    } catch (err: any) {
      this.logger.error(`Error updating document: ${err.message}`);
      throw new HttpException(
        err.message || 'Failed to update document',
        err.statusCode || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Delete a document
   */
  @Delete(':documentId')
  @ResponseMessage('Document deleted successfully')
  async deleteDocument(
    @Req() request: Request,
    @Param('documentId') documentId: string,
  ): Promise<{ message: string }> {
    try {
      const payload = request['payload'] as TokenPayload;
      this.logger.log(`Deleting document ${documentId} for user ${payload.id}`);

      await this.userDocumentService.deleteDocument(documentId, payload.id);

      return { message: 'Document deleted successfully' };
    } catch (err: any) {
      this.logger.error(`Error deleting document: ${err.message}`);
      throw new HttpException(
        err.message || 'Failed to delete document',
        err.statusCode || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get document expiry warnings
   * Returns split lists of expired and expiring documents
   */
  @Get('warnings/expiry')
  @ResponseMessage('Expiry warnings retrieved successfully')
  async getDocumentExpiryWarnings(@Req() request: Request): Promise<DocumentExpiryWarningsDto> {
    try {
      const payload = request['payload'] as TokenPayload;
      this.logger.log(`Fetching expiry warnings for user ${payload.id}`);

      const warnings = await this.userDocumentService.getDocumentExpiryWarnings(
        payload.id,
      );

      const mapDocuments = (docs: any[]) =>
        docs.map((doc) => ({
          id: doc.id,
          unique_id: doc.unique_id,
          document_type: doc.document_type,
          document_url: doc.document_url,
          expiry_date: doc.expiry_date.toISOString().split('T')[0],
          isExpired: doc.expiry_date < new Date(),
          daysUntilExpiry: Math.ceil(
            (doc.expiry_date.getTime() - new Date().getTime()) /
              (1000 * 60 * 60 * 24),
          ),
        }));

      return {
        expired: mapDocuments(warnings.expiredDocuments),
        expiring: mapDocuments(warnings.expiringDocuments),
        hasWarnings: warnings.expiredDocuments.length > 0 || warnings.expiringDocuments.length > 0,
      };
    } catch (err: any) {
      this.logger.error(`Error fetching expiry warnings: ${err.message}`);
      throw new HttpException(
        err.message || 'Failed to fetch expiry warnings',
        err.statusCode || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Manual trigger for document expiry check (for testing)
   * Only for development/admin purposes
   */
  @Post('check-expiry/manual')
  @ResponseMessage('Document expiry check completed successfully')
  async manualCheckExpiringDocuments(): Promise<{ message: string }> {
    try {
      this.logger.log('Manual document expiry check triggered');

      await this.documentExpiryCheckService.manualCheckExpiringDocuments();

      return {
        message:
          'Document expiry check completed successfully. Notifications sent to affected users.',
      };
    } catch (err: any) {
      this.logger.error(`Error during manual expiry check: ${err.message}`);
      throw new HttpException(
        err.message || 'Failed to run expiry check',
        err.statusCode || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
