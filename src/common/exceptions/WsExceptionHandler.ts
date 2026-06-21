import { Catch, ArgumentsHost, Logger } from '@nestjs/common';
import { BaseWsExceptionFilter, WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';

@Catch()
export class WsExceptionsFilter extends BaseWsExceptionFilter {
    private readonly logger = new Logger(WsExceptionsFilter.name);

    catch(exception: any, host: ArgumentsHost) {
        try {
            const client = host.switchToWs().getClient<Socket>();
            const error = exception instanceof WsException ? exception.getError() : exception;
            this.logger.error(`WebSocket Exception: ${JSON.stringify(error?.message || error || exception)}`);
            
            if (client && typeof client.emit === 'function') {
                client.emit('error', {
                    status: 'error',
                    message: exception?.message || 'Internal websocket error'
                });
            }
        } catch (filterError) {
            this.logger.error('Error in WsExceptionsFilter catch block:', filterError);
        }
    }
}
