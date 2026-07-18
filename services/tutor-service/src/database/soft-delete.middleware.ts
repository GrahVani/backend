import { Prisma } from "@grahvani/tutor-database";

const SOFT_DELETE_MODELS = ["TutorSession", "TutorMessage"] as const;
type SoftDeleteModel = (typeof SOFT_DELETE_MODELS)[number];

function isSoftDeleteModel(model: string | undefined): model is SoftDeleteModel {
  return !!model && SOFT_DELETE_MODELS.includes(model as SoftDeleteModel);
}

function withDeletedAtNull<T extends Record<string, unknown>>(args: T | undefined): T {
  const base = args ?? ({} as T);
  const where = (base.where as Record<string, unknown> | undefined) ?? {};

  if ("deletedAt" in where) {
    return base;
  }

  return {
    ...base,
    where: {
      ...where,
      deletedAt: null,
    },
  };
}

export const softDeleteMiddleware: Prisma.Middleware = async (params, next) => {
  const { model, action } = params;

  if (!isSoftDeleteModel(model)) {
    return next(params);
  }

  if (
    action === "findUnique" ||
    action === "findUniqueOrThrow" ||
    action === "findFirst" ||
    action === "findFirstOrThrow" ||
    action === "findMany" ||
    action === "count"
  ) {
    return next({
      ...params,
      args: withDeletedAtNull(params.args as Record<string, unknown> | undefined),
    } as Prisma.MiddlewareParams);
  }

  if (action === "delete") {
    return next({
      ...params,
      action: "update",
      args: {
        ...params.args,
        data: { deletedAt: new Date() },
      },
    } as Prisma.MiddlewareParams);
  }

  if (action === "deleteMany") {
    return next({
      ...params,
      action: "updateMany",
      args: {
        ...params.args,
        data: { deletedAt: new Date() },
      },
    } as Prisma.MiddlewareParams);
  }

  return next(params);
};
