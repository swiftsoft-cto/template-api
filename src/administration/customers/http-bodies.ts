import {
  CreateCustomerSchema,
  CreateBranchAcceptingShortSchema,
} from './customers.schema';

// Classes "holder" para o ZodValidationPipe (usa static schema)
export class CreateCustomerBody {
  static schema = CreateCustomerSchema;
}

export class CreateBranchBody {
  static schema = CreateBranchAcceptingShortSchema;
}
