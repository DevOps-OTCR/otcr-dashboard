'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';
import { taskToActionItem, getAssigneeLabelForTask, type TaskFromApi, type TeamForTasks } from '@/lib/task-utils';
import { projectsAPI, tasksAPI } from '@/lib/api';
import { useAuth } from '@/components/AuthContext';
import FullScreenLoader from '@/components/AuthContext/LoadingScreen';
import { GoogleCalendarPanel } from '@/components/GoogleCalendarPanel';
import { AppNavbar } from '@/components/AppNavbar';

export default function ConsultantDashboard() {
  const session = useAuth();
  const router = useRouter();
  const [tasksFromApi, setTasksFromApi] = useState<TaskFromApi[]>([]);
  const [teamsForTasks, setTeamsForTasks] = useState<TeamForTasks[]>([]);

  useEffect(() => {
    if (!session.loading && !session.isLoggedIn) {
      router.replace('/sign-in');
    }
  }, [session, router]);

  useEffect(() => {
    tasksAPI
      .getAll({ includeCompleted: true })
      .then((res) => setTasksFromApi(Array.isArray(res.data) ? res.data : []))
      .catch(() => setTasksFromApi([]));
  }, [session.user?.email]);

  useEffect(() => {
    projectsAPI
      .getAll({ includeMembers: true, limit: 100 })
      .then((res) => {
        const projects = res.data?.projects ?? [];
        setTeamsForTasks(
          projects.map((p: { id: string; name: string; members?: { user: { email: string } }[] }) => ({
            id: p.id,
            name: p.name,
            memberEmails: p.members?.map((m: { user: { email: string } }) => m.user.email) ?? [],
          })),
        );
      })
      .catch(() => setTeamsForTasks([]));
  }, [session.user?.email]);


  const actionItems = useMemo(() => {
    const fromApi = tasksFromApi.map((t) =>
      taskToActionItem(t, getAssigneeLabelForTask(t, teamsForTasks)),
    );
    return [...fromApi].sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  }, [tasksFromApi, teamsForTasks]);

  const pendingActions = useMemo(
    () => actionItems.filter((a) => !a.completed).length,
    [actionItems],
  );

  const toggleActionItem = (id: string) => {
    const task = tasksFromApi.find((t) => t.id === id);
    if (!task) return;

    const nextCompleted = !task.completed;
    tasksAPI
      .update(id, {
        completed: nextCompleted,
        status: nextCompleted ? 'COMPLETED' : 'PENDING',
      })
      .then(() =>
        tasksAPI
          .getAll({ includeCompleted: true })
          .then((res) => setTasksFromApi(Array.isArray(res.data) ? res.data : [])),
      )
      .catch(() => {});
  };

  if (session.loading || !session.isLoggedIn) {
    return <FullScreenLoader />;
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] flex flex-col">
      <AppNavbar role="CONSULTANT" currentPath="/consultant" />

      <main className="flex-1 px-4 sm:px-6 lg:px-8 py-8">
        <div className="max-w-[1400px] mx-auto grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
          <Card className="shadow-lg h-full">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Assignments</CardTitle>
                  <CardDescription>Tasks assigned to you</CardDescription>
                </div>
                <Badge variant="info" size="sm">
                  {pendingActions} open
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 max-h-[560px] overflow-y-auto">
              {actionItems.length === 0 ? (
                <div className="p-4 rounded-xl border border-dashed border-[var(--border)] text-sm text-[var(--foreground)]/60">
                  No assignments yet.
                </div>
              ) : (
                actionItems.map((item) => {
                  const isOverdue = item.dueDate < new Date() && !item.completed;
                  return (
                    <motion.div
                      key={item.id}
                      whileHover={{ y: -2 }}
                      className={cn(
                        'p-4 rounded-2xl border flex items-start gap-3',
                        isOverdue
                          ? 'border-red-400/70 bg-red-50'
                          : 'border-[var(--border)] bg-[var(--secondary)]/80',
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={item.completed}
                        onChange={() => toggleActionItem(item.id)}
                        className="mt-1 w-5 h-5 rounded border-gray-300 text-[rgb(0,51,96)] focus:ring-[rgb(0,51,96)]"
                      />
                      <div className="flex-1">
                        <h5
                          className={cn(
                            'font-semibold text-[var(--foreground)]',
                            item.completed && 'line-through opacity-50',
                          )}
                        >
                          {item.taskName}
                        </h5>
                        <p className="text-sm text-[var(--foreground)]/70 mt-1">
                          {item.projectName} • {item.workstream}
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant={isOverdue ? 'danger' : 'info'} size="sm">
                            {item.dueDate.toLocaleDateString()}
                          </Badge>
                          {isOverdue && (
                            <Badge variant="danger" size="sm">
                              Overdue
                            </Badge>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })
              )}
            </CardContent>
          </Card>

          <GoogleCalendarPanel
            className="shadow-lg h-full"
            title="Google Calendar"
            description="Upcoming dates and deadlines"
          />
        </div>
      </main>
    </div>
  );
}
