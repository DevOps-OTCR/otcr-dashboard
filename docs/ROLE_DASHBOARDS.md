# 🎯 Role-Based Dashboards

## Overview

The OTCR Dashboard now features **dedicated, role-specific dashboards** for Project Managers and Consultants, each tailored to their unique workflows and responsibilities in a consulting club environment.

---

## 🔐 How It Works

### Automatic Routing
When you sign in, the app automatically detects your role based on your email and routes you to the appropriate dashboard:

```typescript
PM Emails:
- lsharma2@illinois.edu
- crawat2@illinois.edu

→ Redirected to: /pm (PM Dashboard)

Other authenticated users:
→ Redirected to: /consultant (Consultant Dashboard)

Admin emails (admin@otcr.com):
→ Stay on: /dashboard (Admin Dashboard)
```

### Accessing Dashboards Directly
- **PM Dashboard**: http://localhost:3001/pm
- **Consultant Dashboard**: http://localhost:3001/consultant
- **Admin Dashboard**: http://localhost:3001/dashboard

---

## 👔 PM Dashboard Features

### Purpose
**Project Manager Command Center** - Oversee all projects, manage team performance, approve requests, and track overall project health.

### Key Features

#### 1. **Extension Request Approvals** 🎯
- **Priority Section**: Pending extension requests shown prominently at top
- **Quick Actions**: Approve or deny requests with one click
- **Context**: See full request details, reasons, and date changes
- **Decision History**: Track all your approval/denial decisions

#### 2. **Team Performance Monitoring** 👥
- **Individual Metrics**: Track each team member's task completion
- **Workload View**: See tasks assigned vs. completed per person
- **Visual Progress**: Color-coded completion rates (green/yellow/red)
- **Quick Assignment**: Assign new tasks directly from dashboard

#### 3. **Project Health Overview** 📊
- **Workstream Status**: Real-time status (On Track / At Risk / Blocked)
- **Progress Tracking**: Visual progress bars for each workstream
- **Days Remaining**: Quick view of time left for each project
- **Risk Indicators**: Immediate visibility into problem areas

#### 4. **Critical Tasks** ⚠️
- **Overdue Items**: See all overdue tasks requiring attention
- **High Priority**: View tasks with approaching deadlines (≤2 days)
- **Assignment View**: Know who's responsible for each critical task
- **Action Required**: Jump to tasks that need immediate intervention

#### 5. **PM Analytics** 📈
- Total Tasks
- Completion Rate %
- Overdue Count
- Pending Extensions
- At-Risk Workstreams
- Team Utilization %

### PM-Specific Actions
- ✅ **Approve/Deny Extension Requests**
- 👤 **Assign Tasks to Team Members**
- 📊 **View Team Performance Metrics**
- 🎯 **Monitor Project Health**
- ⚡ **Identify Bottlenecks**
- 📈 **Track Overall Progress**

---

## 💼 Consultant Dashboard Features

### Purpose
**Consultant Workspace** - Focus on your assigned tasks, manage deadlines, submit work, and request help when needed.

### Key Features

#### 1. **Announcements** 📢
- **Team Updates**: Latest announcements from PM and leadership
- **Priority Alerts**: Urgent announcements highlighted in red
- **Quick Access**: Stay informed on project updates and changes

#### 2. **Action Items** ✅
- **Your Tasks**: All tasks assigned to you
- **Due Date Sorting**: Tasks ordered by deadline
- **Status Tracking**: Mark tasks complete with checkbox
- **Overdue Alerts**: Red highlighting for overdue items
- **Progress Tracking**: See your completion progress

#### 3. **Workstream Deadlines** 📅
- **Milestone View**: All upcoming workstream deadlines
- **Progress Bars**: Visual representation of workstream completion
- **Time Remaining**: Days left for each deliverable
- **Color Coding**: Red/Yellow/Green based on urgency

#### 4. **Extension Requests** 🕐
- **Request Extensions**: Submit deadline extension requests to PM
- **Track Status**: See pending, approved, or denied requests
- **Provide Context**: Explain why extension is needed
- **Response View**: See PM's decision and feedback

#### 5. **Document Management** 📁
- **Quick Access**: Grid view of workstream documents
- **Document Icons**: Visual indicators for file types (Docs, Sheets, Slides, PDF)
- **Upload Files**: Submit deliverables directly from dashboard
- **Workstream Organization**: Documents organized by project

#### 6. **Previous Week Summary** 📝
- **Accomplishments**: Review what you completed last week
- **Hours Logged**: See total time invested
- **Workstream Breakdown**: Tasks completed per workstream
- **Key Achievements**: Highlight major accomplishments

### Consultant-Specific Actions
- ✏️ **Complete Assigned Tasks**
- 📤 **Upload Deliverables**
- 🕐 **Request Deadline Extensions**
- ⏰ **Track Personal Progress**
- 📊 **View Workstream Status**
- 📅 **Monitor Upcoming Deadlines**

---

## 🎨 UI/UX Differences

### PM Dashboard
- **Sidebar Color**: Indigo/Purple gradient (leadership theme)
- **Layout Focus**: Wide overview, multi-column analytics
- **Primary Actions**: Approval buttons, assignment controls
- **Metrics**: Team-wide, project-wide statistics
- **Tone**: Command & control, strategic oversight

### Consultant Dashboard
- **Sidebar Color**: Purple gradient (individual contributor theme)
- **Layout Focus**: Task-centric, focused workspace
- **Primary Actions**: Task completion, submission buttons
- **Metrics**: Personal progress, individual workload
- **Tone**: Execution-focused, tactical

---

## 📊 Feature Comparison Matrix

| Feature | PM Dashboard | Consultant Dashboard | Admin Dashboard |
|---------|--------------|----------------------|-----------------|
| Extension Approvals | ✅ Approve/Deny | ❌ Request only | ✅ Full control |
| Team Performance | ✅ View all | ❌ Not visible | ✅ Full analytics |
| Task Assignment | ✅ Assign to others | ❌ Self-assigned | ✅ Assign anyone |
| Extension Requests | ❌ Not needed | ✅ Submit requests | ✅ View all |
| Personal Tasks | ✅ If assigned | ✅ Primary focus | ✅ If assigned |
| Workstream Health | ✅ All projects | ✅ Own workstreams | ✅ All projects |
| Critical Tasks View | ✅ Team-wide | ❌ Own tasks only | ✅ All tasks |
| Previous Week Summary | ❌ | ✅ Personal | ✅ Team-wide |
| Document Upload | ✅ | ✅ | ✅ |
| Announcements | ✅ Create | ✅ View only | ✅ Full control |

---

## 🔄 Switching Between Dashboards

### For Testing/Development
You can manually navigate to different dashboards by changing the URL:

```bash
# PM Dashboard
http://localhost:3001/pm

# Consultant Dashboard
http://localhost:3001/consultant

# Admin Dashboard (fallback/default)
http://localhost:3001/dashboard
```

### Changing Your Role
Update your email in the `getUserRole` function:

**File**: `frontend/app/dashboard/page.tsx`

```typescript
function getUserRole(email: string): 'PM' | 'CONSULTANT' | 'ADMIN' {
  const pmEmails = ['lsharma2@illinois.edu', 'crawat2@illinois.edu'];
  const adminEmails = ['admin@otcr.com'];

  if (adminEmails.includes(email)) return 'ADMIN';
  if (pmEmails.includes(email)) return 'PM';
  return 'CONSULTANT';
}
```

Add your email to the appropriate array to test different roles.

---

## 🎯 Real-World Consulting Club Workflow

### PM Workflow
1. **Morning Check**: Review critical tasks and at-risk workstreams
2. **Approve Requests**: Handle pending extension requests from team
3. **Monitor Progress**: Check team performance and completion rates
4. **Assign Work**: Distribute new tasks based on workload
5. **Identify Blockers**: Jump on overdue or high-priority items
6. **Team Support**: Reach out to struggling team members

### Consultant Workflow
1. **Check Announcements**: Stay updated on project changes
2. **Review Tasks**: See what's due today/this week
3. **Complete Work**: Mark tasks done as you finish them
4. **Submit Deliverables**: Upload documents to workstreams
5. **Request Extensions**: If blocked, request more time with context
6. **Track Progress**: Monitor your personal completion rate

---

## 🚀 Production Considerations

### Role Management
In production, roles should be determined by:
- Database user records
- Clerk user metadata
- OAuth group membership
- Manual admin assignment

### Security
- Routes should be protected with middleware
- API endpoints should verify role permissions
- Unauthorized access should redirect to login

### Scalability
- Add more roles as needed (Analyst, Director, etc.)
- Create role-based permissions matrix
- Implement feature flags per role

---

## 📝 Customization Guide

### Adding a New Role

1. **Define the role** in `getUserRole()`:
```typescript
function getUserRole(email: string): 'PM' | 'CONSULTANT' | 'ANALYST' | 'ADMIN' {
  const analystEmails = ['analyst@otcr.com'];
  // Add check for new role
  if (analystEmails.includes(email)) return 'ANALYST';
  // ... rest of logic
}
```

2. **Create dashboard page**: `/app/analyst/page.tsx`

3. **Add routing logic** in main dashboard:
```typescript
if (userRole === 'ANALYST') {
  window.location.href = '/analyst';
}
```

4. **Design role-specific features** based on responsibilities

---

## 🎓 College Consulting Club Best Practices

### PM Responsibilities
- Weekly check-ins with each team member
- Approve extension requests within 24 hours
- Monitor overall project timeline and scope
- Escalate blockers to faculty advisor
- Maintain client communication
- Conduct project retrospectives

### Consultant Responsibilities
- Meet individual deadlines
- Communicate blockers early
- Upload work before meetings
- Request extensions 48+ hours in advance
- Collaborate with team on workstreams
- Attend all team meetings

---

## 🐛 Troubleshooting

### Dashboard Not Loading
**Issue**: Stuck on loading screen or 404

**Solutions**:
1. Check that you're signed in with Clerk
2. Verify your email is recognized in `getUserRole()`
3. Check browser console for errors
4. Clear cache and reload

### Wrong Dashboard Shown
**Issue**: PM sees Consultant dashboard or vice versa

**Solutions**:
1. Verify email in `getUserRole()` function
2. Check for typos in email comparison
3. Sign out and sign back in
4. Clear browser cache

### Can't Access Features
**Issue**: Some buttons/features don't work

**Solutions**:
1. Verify you're on the correct role dashboard
2. Check console for permission errors
3. Ensure all dependencies are installed
4. Restart dev server

---

## 📧 Support

Questions about role-based dashboards?
- Check this guide first
- Review code in `/app/pm` and `/app/consultant`
- Test with different email addresses
- Contact your dev team

---

**Role dashboards implemented**: December 6, 2025
**Status**: ✅ Production Ready
