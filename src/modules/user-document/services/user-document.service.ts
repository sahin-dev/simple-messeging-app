import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UploadUserDocumentDto, UpdateUserDocumentDto } from '../dtos/user-document.dto';
import { NotificationDispatcherService } from '../../notification/services/notification-dispatcher.service';

@Injectable()
export class UserDocumentService {
  private readonly logger = new Logger(UserDocumentService.name);
  private readonly EXPIRY_WARNING_DAYS = 30; // Send notification if expiry is within 30 days

  constructor(
    private readonly prismaService: PrismaService,
    private readonly notificationDispatcherService: NotificationDispatcherService,
  ) {}

  /**
   * Upload a new user document
   */
  async uploadDocument(userId: string, uploadDto: UploadUserDocumentDto) {
    // Verify user exists
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check if user already has a document of this type
    const existingDocument = await this.prismaService.userDocument.findFirst({
      where: {
        user_id: userId,
        document_type: uploadDto.document_type,
      },
    });

    if (existingDocument) {
      throw new BadRequestException(
        `You already have a ${uploadDto.document_type} document. Please update or delete it first.`,
      );
    }

    const expiryDate = this.resolveExpiryDate(
      uploadDto.document_type,
      uploadDto.expiry_date,
    );

    // Use the unique_id provided by the user
    const uniqueId = uploadDto.unique_id;

    const document = await this.prismaService.userDocument.create({
      data: {
        user_id: userId,
        unique_id: uniqueId,
        document_type: uploadDto.document_type,
        document_url: uploadDto.document_url,
        expiry_date: expiryDate,
      },
    });

    if (uploadDto.document_type === 'VEHICLE_OWNERSHIP') {
      await this.prismaService.user.update({
        where: { id: userId },
        data: { is_vehicle_ownership_document_submitted: true },
      });
    }

    const uploaderName = user.nick_name || user.name || 'A user';
    this.notificationDispatcherService.dispatchAdminNotification(
      'New Document Uploaded',
      `${uploaderName} uploaded a new ${document.document_type} document for verification.`,
      { documentId: document.id, userId }
    ).catch((err) => {
      this.logger.error(`Failed to notify admins of document upload: ${err.message}`);
    });

    return this.formatDocumentResponse(document);
  }

  /**
   * Get all documents for a user
   */
  async getUserDocuments(userId: string) {
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const documents = await this.prismaService.userDocument.findMany({
      where: { user_id: userId },
      orderBy: { expiry_date: 'asc' },
    });

    return documents.map((doc) => this.formatDocumentResponse(doc));
  }

  /**
   * Get document type and days left for auth/me.
   */
  async getUserDocumentExpirySummaries(userId: string) {
    const documents = await this.prismaService.userDocument.findMany({
      where: { user_id: userId },
      select: {
        document_type: true,
        expiry_date: true,
      },
      orderBy: { expiry_date: 'asc' },
    });

    return documents.map((document) => ({
      document_type: document.document_type,
      daysUntilExpiry: this.getDaysUntilExpiry(document.expiry_date),
    }));
  }

  /**
   * Get a specific document
   */
  async getDocumentById(documentId: string, userId: string) {
    const document = await this.prismaService.userDocument.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    // Verify ownership
    if (document.user_id !== userId) {
      throw new BadRequestException('You do not have permission to access this document');
    }

    return this.formatDocumentResponse(document);
  }

  /**
   * Get document by type for a user
   */
  async getDocumentByType(userId: string, documentType: string) {
    const document = await this.prismaService.userDocument.findFirst({
      where: {
        user_id: userId,
        document_type: documentType as any,
      },
    });

    if (!document) {
      throw new NotFoundException(`No ${documentType} document found`);
    }

    return this.formatDocumentResponse(document);
  }

  /**
   * Update a document
   */
  async updateDocument(
    documentId: string,
    userId: string,
    updateDto: UpdateUserDocumentDto,
  ) {
    const document = await this.prismaService.userDocument.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    if (document.user_id !== userId) {
      throw new BadRequestException('You do not have permission to update this document');
    }

    // Build update data - only update fields if provided
    const updateData: any = {};

    // Only update unique_id if provided
    if (updateDto.unique_id) {
      updateData.unique_id = updateDto.unique_id;
    }

    if (updateDto.document_type) {
      updateData.document_type = updateDto.document_type;
    }

    const documentType = updateDto.document_type ?? document.document_type;
    if (documentType === 'VEHICLE_OWNERSHIP') {
      updateData.expiry_date = null;
    } else if (updateDto.expiry_date) {
      updateData.expiry_date = this.resolveExpiryDate(
        documentType,
        updateDto.expiry_date,
      );
    }

    // Only update document_url if provided
    if (updateDto.document_url) {
      updateData.document_url = updateDto.document_url;
    }

    // If no fields to update, return existing document
    if (Object.keys(updateData).length === 0) {
      return this.formatDocumentResponse(document);
    }

    const updatedDocument = await this.prismaService.userDocument.update({
      where: { id: documentId },
      data: updateData,
    });

    const owner = await this.prismaService.user.findUnique({ where: { id: userId } });
    const ownerName = owner?.nick_name || owner?.name || 'A user';
    this.notificationDispatcherService.dispatchAdminNotification(
      'Document Updated',
      `${ownerName} updated their ${updatedDocument.document_type} document.`,
      { documentId, userId }
    ).catch((err) => {
      this.logger.error(`Failed to notify admins of document update: ${err.message}`);
    });

    return this.formatDocumentResponse(updatedDocument);
  }

  /**
   * Delete a document
   */
  async deleteDocument(documentId: string, userId: string) {
    const document = await this.prismaService.userDocument.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    if (document.user_id !== userId) {
      throw new BadRequestException('You do not have permission to delete this document');
    }

    await this.prismaService.userDocument.delete({
      where: { id: documentId },
    });

    // If deleting vehicle ownership document, remove submission status and verification badge if verified
    if (document.document_type === 'VEHICLE_OWNERSHIP') {
      const updateData: any = { is_vehicle_ownership_document_submitted: false };
      if (document.is_verified) {
        updateData.is_vehicle_verified = false;
      }
      await this.prismaService.user.update({
        where: { id: document.user_id },
        data: updateData,
      });
    }

    return { message: 'Document deleted successfully' };
  }

  /**
   * Check for expiring documents and return warnings
   */
  async getDocumentExpiryWarnings(userId: string) {
    const documents = await this.prismaService.userDocument.findMany({
      where: { user_id: userId },
      orderBy: { expiry_date: 'asc' },
    });

    const now = new Date();
    const warningDate = new Date();
    warningDate.setDate(warningDate.getDate() + this.EXPIRY_WARNING_DAYS);

    const expiringDocuments = documents.filter((doc) => {
      const expiryDate = doc.expiry_date;
      const isExpiring = expiryDate !== null && expiryDate <= warningDate && expiryDate > now;
      return isExpiring;
    });

    const expiredDocuments = documents.filter((doc) => {
      const expiryDate = doc.expiry_date;
      return expiryDate !== null && expiryDate <= now;
    });

    return {
      expiredDocuments: expiredDocuments.map((doc) => this.formatDocumentResponse(doc)),
      expiringDocuments: expiringDocuments.map((doc) => this.formatDocumentResponse(doc)),
    };
  }

  /**
   * Get all documents across all users that are expiring soon (for scheduled job)
   */
  async getAllExpiringDocuments(daysThreshold: number = this.EXPIRY_WARNING_DAYS) {
    const now = new Date();
    const warningDate = new Date();
    warningDate.setDate(warningDate.getDate() + daysThreshold);

    const expiringDocuments = await this.prismaService.userDocument.findMany({
      where: {
        expiry_date: {
          lte: warningDate,
          gt: now,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            fcm_token: true,
            nick_name: true,
            email: true,
          },
        },
      },
      orderBy: { expiry_date: 'asc' },
    });

    return expiringDocuments;
  }

  /**
   * Get all expired documents across all users (for maintenance)
   */
  async getAllExpiredDocuments() {
    const now = new Date();

    const expiredDocuments = await this.prismaService.userDocument.findMany({
      where: {
        expiry_date: {
          lt: now,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            nick_name: true,
            email: true,
          },
        },
      },
      orderBy: { expiry_date: 'asc' },
    });

    return expiredDocuments;
  }

  /**
   * Get all user documents (admin only)
   * Can filter by userId if provided
   */
  async getAllUserDocumentsForAdmin(userId?: string) {
    const whereClause: any = {};

    if (userId) {
      // If userId is provided, verify the user exists
      const user = await this.prismaService.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      whereClause.user_id = userId;
    }

    const documents = await this.prismaService.userDocument.findMany({
      where: whereClause,
      include: {
        user: {
          select: {
            id: true,
            nick_name: true,
            email: true,
          },
        },
      },
      orderBy: [{ user_id: 'asc' }, { expiry_date: 'asc' }],
    });

    return documents.map((doc) => ({
      id: doc.id,
      user_id: doc.user_id,
      unique_id: doc.unique_id,
      document_type: doc.document_type,
      document_url: doc.document_url,
      expiry_date: doc.expiry_date,
      is_verified: doc.is_verified,
      isExpired: this.isDocumentExpired(doc.expiry_date),
      daysUntilExpiry: this.getDaysUntilExpiry(doc.expiry_date),
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      user: doc.user,
    }));
  }

  /**
   * Calculate days until document expiry
   */
  private resolveExpiryDate(documentType: string, expiryDate?: string | null): Date | null {
    if (documentType === 'VEHICLE_OWNERSHIP') {
      return null;
    }

    if (!expiryDate) {
      throw new BadRequestException('Document expiry date is required');
    }

    const parsedExpiryDate = new Date(expiryDate);
    if (Number.isNaN(parsedExpiryDate.getTime())) {
      throw new BadRequestException('Document expiry date is invalid');
    }

    if (parsedExpiryDate <= new Date()) {
      throw new BadRequestException('Document expiry date must be in the future');
    }

    return parsedExpiryDate;
  }

  private getDaysUntilExpiry(expiryDate: Date | null): number {
    if (!expiryDate) {
      return -1;
    }

    const now = new Date();
    const diffTime = expiryDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }

  /**
   * Check if document is expired
   */
  private isDocumentExpired(expiryDate: Date | null): boolean {
    if (!expiryDate) {
      return false;
    }

    return expiryDate <= new Date();
  }

  /**
   * Verify user document (Admin only)
   */
  async verifyDocument(documentId: string, isVerified: boolean) {
    const document = await this.prismaService.userDocument.findUnique({
      where: { id: documentId },
      include: { user: true },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    if (isVerified && document.document_type === 'VEHICLE_OWNERSHIP') {
      if (!document.user.licence_id) {
        throw new BadRequestException('User has no license ID in their profile to match');
      }

      const documentUniqueId = document.unique_id?.trim().toLowerCase();
      if (!documentUniqueId) {
        throw new BadRequestException('Document unique ID is missing');
      }

      if (document.user.licence_id.trim().toLowerCase() !== documentUniqueId) {
        throw new BadRequestException(
          `Verification failed: License plate in profile (${document.user.licence_id}) does not match the document unique ID (${document.unique_id})`
        );
      }
    }

    const updatedDocument = await this.prismaService.userDocument.update({
      where: { id: documentId },
      data: { is_verified: isVerified },
    });

    if (document.document_type === 'VEHICLE_OWNERSHIP') {
      await this.prismaService.user.update({
        where: { id: document.user_id },
        data: { is_vehicle_verified: isVerified },
      });
    }

    const statusText = isVerified ? 'verified' : 'rejected';
    const message = isVerified
      ? `Your ${document.document_type} document has been verified successfully.`
      : `Your ${document.document_type} document verification failed/was rejected.`;
    
    this.notificationDispatcherService.dispatchSystemNotification(
      [document.user_id],
      `Document Verification ${isVerified ? 'Success' : 'Failed'}`,
      message,
      { documentId, documentType: document.document_type, status: statusText }
    ).catch((err) => {
      this.logger.error(`Failed to dispatch document verification notification to user ${document.user_id}: ${err.message}`);
    });

    return this.formatDocumentResponse(updatedDocument);
  }

  /**
   * Format document response with expiry information
   */
  private formatDocumentResponse(document: any) {
    const daysUntilExpiry = this.getDaysUntilExpiry(document.expiry_date);
    const isExpired = this.isDocumentExpired(document.expiry_date);

    return {
      id: document.id,
      user_id: document.user_id,
      unique_id: document.unique_id,
      document_type: document.document_type,
      document_url: document.document_url,
      expiry_date: document.expiry_date,
      is_verified: document.is_verified,
      isExpired,
      daysUntilExpiry,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
    };
  }
}
