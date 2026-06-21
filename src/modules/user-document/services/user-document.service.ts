import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UploadUserDocumentDto, UpdateUserDocumentDto } from '../dtos/user-document.dto';

@Injectable()
export class UserDocumentService {
  private readonly logger = new Logger(UserDocumentService.name);
  private readonly EXPIRY_WARNING_DAYS = 30; // Send notification if expiry is within 30 days

  constructor(private readonly prismaService: PrismaService) {}

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

    // Validate expiry date is in the future
    const expiryDate = new Date(uploadDto.expiry_date);
    if (expiryDate <= new Date()) {
      throw new BadRequestException('Document expiry date must be in the future');
    }

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

    // Only update expiry_date if provided
    if (updateDto.expiry_date) {
      const expiryDate = new Date(updateDto.expiry_date);
      if (expiryDate <= new Date()) {
        throw new BadRequestException('Document expiry date must be in the future');
      }
      updateData.expiry_date = expiryDate;
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
      const isExpiring = doc.expiry_date <= warningDate && doc.expiry_date > now;
      return isExpiring;
    });

    const expiredDocuments = documents.filter((doc) => doc.expiry_date <= now);

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
      isExpired: doc.expiry_date <= new Date(),
      daysUntilExpiry: this.getDaysUntilExpiry(doc.expiry_date),
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      user: doc.user,
    }));
  }

  /**
   * Calculate days until document expiry
   */
  private getDaysUntilExpiry(expiryDate: Date): number {
    const now = new Date();
    const diffTime = expiryDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }

  /**
   * Check if document is expired
   */
  private isDocumentExpired(expiryDate: Date): boolean {
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
      if (document.user.licence_id.trim().toLowerCase() !== document.unique_id.trim().toLowerCase()) {
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
