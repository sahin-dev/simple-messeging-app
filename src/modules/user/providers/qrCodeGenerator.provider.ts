import { Injectable } from "@nestjs/common";
import QrCode from 'qrcode'

@Injectable()
export class QrCodeGeneratorProvider{

    async generateQrCode(data:string):Promise<string>{
        // For demonstration, we return a placeholder QR code URL.
        // In a real implementation, you would use a library like 'qrcode' to generate a QR code image and return its URL or data URI.

        const qrCodeData = QrCode.toDataURL(data, { width: 200, margin: 2 });

        return qrCodeData;
        // // Alternatively, you could save the QR code image to a storage service and return the URL:
        // // const qrCodeUrl = await this.saveQrCodeToStorage(data);
        // // return qrCodeUrl;
        // return `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(data)}&size=200x200`;
    }
}