import { TokenPayload } from "../auth/types/TokenPayload.type";

declare module "express-serve-static-core" {
  interface Request {
    payload?: TokenPayload;
  }
}
