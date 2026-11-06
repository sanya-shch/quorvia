import { Prisma } from '@prisma/client';

// For nullable Json columns Prisma does not accept JS `null`: it must be replaced with
// `Prisma.DbNull` (SQL NULL). `undefined` means "leave untouched".
export const toNullableJson = (
  value: unknown,
): Prisma.InputJsonValue | typeof Prisma.DbNull | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.DbNull;
  return value as Prisma.InputJsonValue;
};

export const toJson = (value: unknown): Prisma.InputJsonValue => {
  return value as Prisma.InputJsonValue;
};
