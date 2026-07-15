import { BadRequestException } from "@nestjs/common";
import { MongoIdValidationPipe } from "./mongo-id-validation.pipe";

describe("MongoIdValidationPipe", () => {
  const pipe = new MongoIdValidationPipe();

  it("rejects invalid MongoDB ObjectIds in route params", () => {
    expect(() =>
      pipe.transform("invalid-id", {
        type: "param",
        metatype: String,
        data: "userId",
      }),
    ).toThrow(BadRequestException);
  });

  it("validates nested MongoDB ObjectId arrays in request bodies", () => {
    expect(() =>
      pipe.transform(
        {
          memberIds: ["507f1f77bcf86cd799439011", "not-a-mongo-id"],
        },
        {
          type: "body",
          metatype: Object,
          data: undefined,
        },
      ),
    ).toThrow(BadRequestException);
  });

  it("does not reject non-Mongo id-like fields", () => {
    expect(
      pipe.transform(
        {
          licence_id: "DHAKA-123",
          deviceId: "ios-device-123",
        },
        {
          type: "body",
          metatype: Object,
          data: undefined,
        },
      ),
    ).toEqual({
      licence_id: "DHAKA-123",
      deviceId: "ios-device-123",
    });
  });
});

