import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from "@nestjs/common";
import {
  collectMongoIdValidationErrors,
  collectMongoIdValueValidationErrors,
  isMongoIdFieldName,
} from "../utils/mongo-id.util";

@Injectable()
export class MongoIdValidationPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata) {
    if (value === undefined || value === null) {
      return value;
    }

    if (metadata.data && isMongoIdFieldName(metadata.data)) {
      this.throwIfInvalid(collectMongoIdValueValidationErrors(metadata.data, value));
      return value;
    }

    if (metadata.type === "body" || metadata.type === "query" || metadata.type === "param") {
      this.throwIfInvalid(collectMongoIdValidationErrors(value));
    }

    return value;
  }

  private throwIfInvalid(errors: string[]) {
    if (errors.length > 0) {
      throw new BadRequestException(errors.length === 1 ? errors[0] : errors);
    }
  }
}
