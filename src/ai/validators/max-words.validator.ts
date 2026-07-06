import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

@ValidatorConstraint({ name: 'maxWords', async: false })
export class MaxWordsConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    if (typeof value !== 'string') return false;
    const max = (args.constraints[0] as number) ?? 1000;
    return countWords(value) <= max;
  }

  defaultMessage(args: ValidationArguments): string {
    const max = (args.constraints[0] as number) ?? 1000;
    return `Maqola talabi ${max} ta so'zdan oshmasligi kerak`;
  }
}

export function MaxWords(max: number, validationOptions?: ValidationOptions) {
  return function maxWordsDecorator(
    object: object,
    propertyName: string,
  ): void {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [max],
      validator: MaxWordsConstraint,
    });
  };
}

@ValidatorConstraint({ name: 'minWords', async: false })
export class MinWordsConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    if (typeof value !== 'string') return false;
    const min = (args.constraints[0] as number) ?? 1;
    return countWords(value) >= min;
  }

  defaultMessage(args: ValidationArguments): string {
    const min = (args.constraints[0] as number) ?? 1;
    return `Maqola talabini kamida ${min} ta so'zdan yozing`;
  }
}

export function MinWords(min: number, validationOptions?: ValidationOptions) {
  return function minWordsDecorator(
    object: object,
    propertyName: string,
  ): void {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [min],
      validator: MinWordsConstraint,
    });
  };
}
