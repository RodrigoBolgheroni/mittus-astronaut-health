import { ValidatorConstraint } from 'class-validator';
import type {
  ValidationArguments,
  ValidatorConstraintInterface,
} from 'class-validator';
import type { ListCheckInsQueryParams } from './list-check-ins.query-params.js';

// Only the cross-field rule needs a custom validator; field types use built-in decorators.
@ValidatorConstraint({ name: 'checkInDateRange', async: false })
export class CheckInDateRangeValidator implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments) {
    const { from, to, limit } = args.object as ListCheckInsQueryParams;

    if (limit !== undefined) return false;

    const days = (Date.parse(to!) - Date.parse(from!)) / 86400000;
    return days > 0 && days <= 366;
  }

  defaultMessage() {
    return 'Date range must be greater than zero and at most 366 days, and cannot be combined with limit.';
  }
}
