import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';

const MIN_FCM_TOKEN_LENGTH = 20;
const MAX_FCM_TOKEN_LENGTH = 4096;

export function IsFcmToken(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isFcmToken',
      target: object.constructor,
      propertyName,
      options: {
        message:
          '$property must be a valid FCM registration token: no whitespace, 20-4096 characters.',
        ...validationOptions,
      },
      validator: {
        validate(value: unknown) {
          if (typeof value !== 'string') {
            return false;
          }

          return (
            value.length >= MIN_FCM_TOKEN_LENGTH &&
            value.length <= MAX_FCM_TOKEN_LENGTH &&
            !/\s/.test(value)
          );
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be a valid FCM registration token: no whitespace, 20-4096 characters.`;
        },
      },
    });
  };
}
