import { Prisma } from '@prisma/client';

/**
 * Для nullable Json-колонок Prisma не приймає JS `null`: його треба
 * замінити на `Prisma.DbNull` (SQL NULL). `undefined` означає "не чіпати".
 */
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
