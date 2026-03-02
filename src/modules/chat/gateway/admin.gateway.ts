import { Injectable, UsePipes, ValidationPipe } from "@nestjs/common";
import { OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit, WebSocketGateway } from "@nestjs/websockets";

@WebSocketGateway({namespace:"/admin", cors:"*"})

@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
  }),
)
@Injectable()
export class AdminGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {

    handleDisconnect(client: any) {
        throw new Error("Method not implemented.");
    }
    handleConnection(client: any, ...args: any[]) {
        throw new Error("Method not implemented.");
    }
    afterInit(server: any) {
        throw new Error("Method not implemented.");
    }

}