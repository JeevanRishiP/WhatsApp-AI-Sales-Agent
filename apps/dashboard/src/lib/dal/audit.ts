import { prisma, type Prisma, type RevisionEntity, type RevisionAction, type StaffRole } from '@wcos/db';

export interface AuditLogFilterOptions {
  page?: number;
  limit?: number;
  entityType?: RevisionEntity;
  entityId?: string;
  action?: RevisionAction;
  staffId?: string;
  search?: string;
}

export interface AuditPaginatedResult<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface AuditRecord {
  id: string;
  tenantId: string;
  entityType: string;
  entityId: string;
  action: string;
  staffId: string | null;
  staffName: string;
  staffRole: string;
  actorType: string;
  reason: string;
  beforeSnapshot: any;
  afterSnapshot: any;
  diffSummary: any;
  ipAddress: string | null;
  userAgent: string | null;
  timestamp: Date;
  staff?: {
    id: string;
    fullName: string;
    role: string;
    avatarUrl: string | null;
  } | null;
}

/**
 * List immutable revision audit logs with filtering by staff, entity, and search.
 */
export async function listAuditLogs(
  tenantId: string,
  opts: AuditLogFilterOptions = {}
): Promise<AuditPaginatedResult<AuditRecord>> {
  const page = Math.max(1, opts.page || 1);
  const limit = Math.min(opts.limit || 25, 100);
  const skip = (page - 1) * limit;

  const where: Prisma.DataRevisionLogWhereInput = { tenantId };

  if (opts.entityType) {
    where.entityType = opts.entityType;
  }
  if (opts.entityId) {
    where.entityId = opts.entityId;
  }
  if (opts.action) {
    where.action = opts.action;
  }
  if (opts.staffId) {
    where.staffId = opts.staffId;
  }
  if (opts.search) {
    where.OR = [
      { reason: { contains: opts.search, mode: 'insensitive' } },
      { staffName: { contains: opts.search, mode: 'insensitive' } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.dataRevisionLog.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      skip,
      take: limit,
      include: {
        staff: {
          select: {
            id: true,
            fullName: true,
            role: true,
            avatarUrl: true,
          },
        },
      },
    }),
    prisma.dataRevisionLog.count({ where }),
  ]);

  return {
    items: items as any,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
}

/**
 * Get audit history for a specific entity (e.g. Order or Customer).
 */
export async function getEntityAuditHistory(
  tenantId: string,
  entityType: RevisionEntity,
  entityId: string
): Promise<AuditRecord[]> {
  const logs = await prisma.dataRevisionLog.findMany({
    where: {
      tenantId,
      entityType,
      entityId,
    },
    orderBy: { timestamp: 'desc' },
    include: {
      staff: {
        select: {
          id: true,
          fullName: true,
          role: true,
          avatarUrl: true,
        },
      },
    },
  });

  return logs as any;
}

/**
 * Append an immutable revision log entry.
 */
export async function recordRevision(params: {
  tenantId: string;
  entityType: RevisionEntity;
  entityId: string;
  action: RevisionAction;
  staffId?: string;
  staffName: string;
  staffRole: StaffRole;
  reason: string;
  beforeSnapshot: Record<string, any>;
  afterSnapshot: Record<string, any>;
  diffSummary?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}) {
  // Compute diff summary automatically if not provided
  let diff = params.diffSummary;
  if (!diff) {
    diff = {};
    const allKeys = Array.from(
      new Set([...Object.keys(params.beforeSnapshot || {}), ...Object.keys(params.afterSnapshot || {})])
    );
    for (const key of allKeys) {
      const beforeVal = params.beforeSnapshot?.[key];
      const afterVal = params.afterSnapshot?.[key];
      if (JSON.stringify(beforeVal) !== JSON.stringify(afterVal)) {
        diff[key] = { from: beforeVal, to: afterVal };
      }
    }
  }

  return prisma.dataRevisionLog.create({
    data: {
      tenantId: params.tenantId,
      entityType: params.entityType,
      entityId: params.entityId,
      action: params.action,
      staffId: params.staffId,
      staffName: params.staffName,
      staffRole: params.staffRole,
      actorType: 'STAFF',
      reason: params.reason,
      beforeSnapshot: params.beforeSnapshot as Prisma.InputJsonValue,
      afterSnapshot: params.afterSnapshot as Prisma.InputJsonValue,
      diffSummary: diff as Prisma.InputJsonValue,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    },
  });
}
