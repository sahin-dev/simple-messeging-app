import { IsString, IsNotEmpty } from 'class-validator';

export class ScanQrCodeDto {
    @IsString()
    @IsNotEmpty()
    qrData: string;
}
