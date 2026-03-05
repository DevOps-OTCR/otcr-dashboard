'use client';

import { Activity } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import type { DashboardDeliverable } from '@/lib/dashboard-deliverables';

type WeeklyDeliverablesCardProps = {
  title?: string;
  description: string;
  items: DashboardDeliverable[];
  emptyMessage: string;
};

export function WeeklyDeliverablesCard({
  title = "This week's deliverables",
  description,
  items,
  emptyMessage,
}: WeeklyDeliverablesCardProps) {
  const now = new Date();

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-[var(--primary)]" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 max-h-[400px] overflow-y-auto">
        {items.length === 0 ? (
          <div className="p-4 rounded-xl border border-dashed border-[var(--border)] text-sm text-[var(--foreground)]/60">
            {emptyMessage}
          </div>
        ) : (
          items.map((item) => {
            const isOverdue = item.deadline < now;

            return (
              <div
                key={item.id}
                className="p-3 rounded-xl border border-[var(--border)] bg-[var(--secondary)]/80"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h5 className="font-semibold text-[var(--foreground)]">{item.title}</h5>
                    <p className="text-xs text-[var(--foreground)]/70">
                      {item.projectName} • {item.sprintLabel}
                    </p>
                  </div>
                  <Badge variant={isOverdue ? 'danger' : 'info'} size="sm">
                    {isOverdue ? 'Overdue' : 'Due'}
                  </Badge>
                </div>
                <p className="mt-2 text-sm text-[var(--foreground)]/70">
                  {item.deadline.toLocaleString()}
                </p>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
