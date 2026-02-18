import { PrismaClient, Role } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { config } from 'dotenv';

config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
const prisma = new PrismaClient({
  adapter: new PrismaPg(pool),
});

async function main() {
  console.log('Seeding database...');

  // Create test users (these will be created when users sign in with Google)
  // For seed purposes, we'll create placeholder users
  const admin = await prisma.user.upsert({
    where: { email: 'admin@otcr.com' },
    update: {},
    create: {
      googleId: 'google_admin_test',
      email: 'admin@otcr.com',
      firstName: 'Admin',
      lastName: 'User',
      role: Role.ADMIN,
    },
  });

  const pm = await prisma.user.upsert({
    where: { email: 'lsharma2@illinois.edu' },
    update: {},
    create: {
      googleId: 'google_pm_test',
      email: 'lsharma2@illinois.edu',
      firstName: 'Project',
      lastName: 'Manager',
      role: Role.PM,
    },
  });

  const consultant1 = await prisma.user.upsert({
    where: { email: 'consultant1@illinois.edu' },
    update: {},
    create: {
      googleId: 'google_consultant1_test',
      email: 'consultant1@illinois.edu',
      firstName: 'John',
      lastName: 'Doe',
      role: Role.CONSULTANT,
    },
  });

  const consultant2 = await prisma.user.upsert({
    where: { email: 'consultant2@illinois.edu' },
    update: {},
    create: {
      googleId: 'google_consultant2_test',
      email: 'consultant2@illinois.edu',
      firstName: 'Jane',
      lastName: 'Smith',
      role: Role.CONSULTANT,
    },
  });

  console.log('✅ Users created');

  // Create allowed emails
  const allowedEmails: Array<{ email: string; role: Role }> = [
    { email: 'vrome@illinois.edu', role: Role.ADMIN },
    { email: 'darshvs2@illinois.edu', role: Role.CONSULTANT },
    { email: 'yjagtap2@illinois.edu', role: Role.CONSULTANT },
    { email: 'tejavk2@illinois.edu', role: Role.CONSULTANT },
    { email: 'sharngi2@illinois.edu', role: Role.CONSULTANT },
    { email: 'kona3@illinois.edu', role: Role.ADMIN },
    { email: 'mpate449@illinois.edu', role: Role.ADMIN },
    { email: 'adeeu2@illinois.edu', role: Role.ADMIN },
    { email: 'crawat2@illinois.edu', role: Role.PM },
    { email: 'bchar@illinois.edu', role: Role.CONSULTANT },
    { email: 'lsharma2@illinois.edu', role: Role.PM },
    { email: 'admin@otcr.com', role: Role.ADMIN },
    // Test users
    { email: 'consultant1@illinois.edu', role: Role.CONSULTANT },
    { email: 'consultant2@illinois.edu', role: Role.CONSULTANT },
    // Example LC and Partner (add real emails as needed)
    { email: 'lc@illinois.edu', role: Role.LC },
    { email: 'partner@illinois.edu', role: Role.PARTNER },
  ];

  for (const allowedEmail of allowedEmails) {
    await prisma.allowedEmail.upsert({
      where: { email: allowedEmail.email },
      update: { role: allowedEmail.role, active: true },
      create: {
        email: allowedEmail.email,
        role: allowedEmail.role,
        active: true,
      },
    });
  }

  console.log('✅ Allowed emails created');

  // Create test projects
  const project1 = await prisma.project.create({
    data: {
      name: 'Digital Transformation Initiative',
      description: 'Help client modernize their legacy systems',
      clientName: 'Acme Corporation',
      pmId: pm.id,
      startDate: new Date('2025-01-01'),
      endDate: new Date('2025-06-30'),
      status: 'ACTIVE',
    },
  });

  const project2 = await prisma.project.create({
    data: {
      name: 'Market Analysis Study',
      description: 'Comprehensive market research and competitive analysis',
      clientName: 'Tech Startup Inc',
      pmId: pm.id,
      startDate: new Date('2025-02-01'),
      endDate: new Date('2025-04-30'),
      status: 'ACTIVE',
    },
  });

  console.log('✅ Projects created');

  // Assign consultants to projects
  await prisma.projectMember.createMany({
    data: [
      {
        projectId: project1.id,
        userId: consultant1.id,
      },
      {
        projectId: project1.id,
        userId: consultant2.id,
      },
      {
        projectId: project2.id,
        userId: consultant1.id,
      },
    ],
  });

  console.log('✅ Project members assigned');

  // Create deliverables
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const nextWeek = new Date(now);
  nextWeek.setDate(nextWeek.getDate() + 7);

  const in30Days = new Date(now);
  in30Days.setDate(in30Days.getDate() + 30);

  await prisma.deliverable.createMany({
    data: [
      {
        projectId: project1.id,
        title: 'Initial Requirements Document',
        description: 'Document current system requirements and pain points',
        type: 'DOCUMENT',
        deadline: tomorrow,
        status: 'PENDING',
      },
      {
        projectId: project1.id,
        title: 'Technical Architecture Proposal',
        description: 'Propose new architecture for modernized system',
        type: 'PRESENTATION',
        deadline: nextWeek,
        status: 'IN_PROGRESS',
      },
      {
        projectId: project1.id,
        title: 'Migration Code Review',
        description: 'Review and validate migration scripts',
        type: 'CODE',
        deadline: in30Days,
        status: 'PENDING',
      },
      {
        projectId: project2.id,
        title: 'Market Research Report',
        description: 'Comprehensive analysis of target market',
        type: 'ANALYSIS',
        deadline: nextWeek,
        status: 'IN_PROGRESS',
      },
      {
        projectId: project2.id,
        title: 'Competitive Analysis',
        description: 'Detailed competitive landscape analysis',
        type: 'REPORT',
        deadline: in30Days,
        status: 'PENDING',
      },
    ],
  });

  console.log('✅ Deliverables created');

  // Create some sample time entries
  await prisma.timeEntry.createMany({
    data: [
      {
        userId: consultant1.id,
        date: now,
        hours: 4.5,
        description: 'Requirements gathering and stakeholder interviews',
      },
      {
        userId: consultant1.id,
        date: now,
        hours: 3.0,
        description: 'Market research and data collection',
      },
      {
        userId: consultant2.id,
        date: now,
        hours: 6.0,
        description: 'Technical documentation and analysis',
      },
    ],
  });

  console.log('✅ Time entries created');

  console.log('');
  console.log('🎉 Seeding completed successfully!');
  console.log('');
  console.log('Test accounts:');
  console.log('  Admin:       admin@otcr.com');
  console.log('  PM:          lsharma2@illinois.edu');
  console.log('  Consultant1: consultant1@illinois.edu');
  console.log('  Consultant2: consultant2@illinois.edu');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
