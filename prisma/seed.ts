import bcrypt from 'bcrypt';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '../generated/prisma/client';

function loadLocalEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    return;
  }

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed
      .slice(separatorIndex + 1)
      .trim()
      .replace(/^"(.*)"$/, '$1')
      .replace(/^'(.*)'$/, '$1');

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadLocalEnv();

const prisma = new PrismaClient();

const passwordPlain = 'Password123!';

const demoUsers = [
  {
    email: 'park.releaser@platechatter.test',
    nick_name: 'park_releaser',
    name: 'Park Releaser',
    licence_id: 'PRK001',
    role: 'USER',
    latitude: 23.7806,
    longitude: 90.4074,
    searchStatus: 'PARKED',
  },
  {
    email: 'park.seeker@platechatter.test',
    nick_name: 'park_seeker',
    name: 'Park Seeker',
    licence_id: 'PRK002',
    role: 'USER',
    latitude: 23.781,
    longitude: 90.4078,
    searchStatus: 'SEARCHING',
  },
  {
    email: 'park.admin@platechatter.test',
    nick_name: 'park_admin',
    name: 'Park Admin',
    licence_id: 'PRK003',
    role: 'ADMIN',
    latitude: 23.7799,
    longitude: 90.4068,
    searchStatus: 'IDLE',
  },
] as const;

const sampleFaqs = [
  {
    title: 'How do I start a chat with another driver?',
    description: 'Search by license plate or nickname, open the driver profile, and send a message request. Once the request is accepted, you can continue the conversation from your messages.',
  },
  {
    title: 'How do parking availability alerts work?',
    description: 'When nearby users report or release parking, PLATEChatter can notify drivers searching in that area based on their notification preferences and location radius.',
  },
  {
    title: 'Why should I upload vehicle documents?',
    description: 'Vehicle documents help verify your account and improve trust with other drivers. Admins review submitted documents before marking them as verified.',
  },
  {
    title: 'Can I block another user?',
    description: 'Yes. You can block a user from their profile or conversation. Blocked users cannot continue direct messaging with you.',
  },
  {
    title: 'How do I update my vehicle information?',
    description: 'Open your profile settings and update your vehicle type, model, color, and location information. Keeping this information current helps other drivers identify the right vehicle.',
  },
] as const;

async function upsertDemoUsers(password: string) {
  const users: any[] = [];

  for (const demoUser of demoUsers) {
    const user = await prisma.user.upsert({
      where: { email: demoUser.email },
      create: {
        email: demoUser.email,
        nick_name: demoUser.nick_name,
        name: demoUser.name,
        licence_id: demoUser.licence_id,
        password,
        designation: demoUser.role === 'ADMIN' ? 'Operations Admin' : 'Driver',
        role: demoUser.role,
        email_verified: true,
        license_no_verified: true,
        is_more_options_accepted: true,
        vehicle_type: 'CAR',
        vehicle_model: 'Seed Demo Car',
        vehicle_color: demoUser.role === 'ADMIN' ? 'Black' : 'White',
        country: 'Bangladesh',
        city: 'Dhaka',
      },
      update: {
        nick_name: demoUser.nick_name,
        name: demoUser.name,
        licence_id: demoUser.licence_id,
        role: demoUser.role,
        email_verified: true,
        license_no_verified: true,
        is_more_options_accepted: true,
        vehicle_type: 'CAR',
        vehicle_model: 'Seed Demo Car',
        vehicle_color: demoUser.role === 'ADMIN' ? 'Black' : 'White',
        country: 'Bangladesh',
        city: 'Dhaka',
      },
    });

    await prisma.userLocation.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        latitude: demoUser.latitude,
        longitude: demoUser.longitude,
        accuracy: 8,
      },
      update: {
        latitude: demoUser.latitude,
        longitude: demoUser.longitude,
        accuracy: 8,
      },
    });

    await prisma.notificationPreference.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        parkingNotifications: true,
        chatNotifications: true,
        ratingNotifications: true,
        groupChatNotifications: true,
        systemNotifications: true,
        notificationRadius: 300,
      },
      update: {
        parkingNotifications: true,
        notificationRadius: 300,
      },
    });

    await prisma.parkingSearchSession.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        latitude: demoUser.latitude,
        longitude: demoUser.longitude,
        accuracy: 8,
        status: demoUser.searchStatus,
      },
      update: {
        latitude: demoUser.latitude,
        longitude: demoUser.longitude,
        accuracy: 8,
        status: demoUser.searchStatus,
      },
    });

    users.push(user);
  }

  return {
    releaser: users[0],
    seeker: users[1],
    admin: users[2],
  };
}

async function seedFaqData() {
  await prisma.faq.deleteMany({
    where: {
      title: {
        in: sampleFaqs.map((faq) => faq.title),
      },
    },
  });

  await prisma.faq.createMany({
    data: sampleFaqs.map((faq) => ({
      title: faq.title,
      description: faq.description,
    })),
  });
}

async function seedParkData() {
  const password = await bcrypt.hash(passwordPlain, 10);
  const { releaser, seeker, admin } = await upsertDemoUsers(password);
  const userIds = [releaser.id, seeker.id, admin.id];

  await prisma.parkingHandoff.deleteMany({
    where: {
      releaserId: { in: userIds },
    },
  });

  await prisma.parkingSession.deleteMany({
    where: {
      userId: { in: userIds },
    },
  });

  await prisma.paidParkingPrompt.deleteMany({
    where: {
      userId: { in: userIds },
    },
  });

  await prisma.savedParkingLocation.deleteMany({
    where: {
      userId: { in: userIds },
    },
  });

  await prisma.parkingArea.deleteMany({
    where: {
      name: {
        in: ['Seed Central Paid Parking', 'Seed Riverside Free Parking'],
      },
    },
  });

  await prisma.savedParkingLocation.createMany({
    data: [
      {
      userId: releaser.id,
      latitude: 23.7806,
      longitude: 90.4074,
      accuracy: 6,
      confidence: 0.93,
      source: 'AUTO',
      isActive: true,
      parkingType: 'FREE',
    },
    {
      userId: seeker.id,
      latitude: 23.781,
      longitude: 90.4078,
      accuracy: 12,
      confidence: 0.71,
      source: 'MANUAL',
      isActive: true,
      parkingType: 'FREE',
    },
    ],
  });

  const activeHandoff = await prisma.parkingHandoff.create({
    data: {
      releaserId: releaser.id,
      latitude: 23.7806,
      longitude: 90.4074,
      status: 'AVAILABLE',
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    },
  });

  const acceptedHandoff = await prisma.parkingHandoff.create({
    data: {
      releaserId: admin.id,
      seekerId: seeker.id,
      latitude: 23.7799,
      longitude: 90.4068,
      status: 'ACCEPTED',
      expiresAt: new Date(Date.now() + 4 * 60 * 1000),
      acceptedAt: new Date(),
    },
  });

  const paidSession = await prisma.parkingSession.create({
    data: {
      userId: releaser.id,
      latitude: 23.7806,
      longitude: 90.4074,
      costType: 'PAID',
      durationMin: 30,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      status: 'ACTIVE',
    },
  });

  const freeSession = await prisma.parkingSession.create({
    data: {
      userId: seeker.id,
      latitude: 23.781,
      longitude: 90.4078,
      costType: 'FREE',
      status: 'ACTIVE',
    },
  });

  const paidArea = await prisma.parkingArea.create({
    data: {
      name: 'Seed Central Paid Parking',
      description: 'Seeded polygon for paid admin parking area',
      centerLat: 23.7806,
      centerLng: 90.4074,
      parkingCost: 'PAID',
      isActive: true,
      createdById: admin.id,
      polygon: [
        { latitude: 23.7801, longitude: 90.4069 },
        { latitude: 23.7811, longitude: 90.4069 },
        { latitude: 23.7811, longitude: 90.4079 },
        { latitude: 23.7801, longitude: 90.4079 },
      ],
    },
  });

  const freeArea = await prisma.parkingArea.create({
    data: {
      name: 'Seed Riverside Free Parking',
      description: 'Seeded polygon for free admin parking area',
      centerLat: 23.7793,
      centerLng: 90.4059,
      parkingCost: 'FREE',
      isActive: true,
      createdById: admin.id,
      polygon: [
        { latitude: 23.7788, longitude: 90.4054 },
        { latitude: 23.7798, longitude: 90.4054 },
        { latitude: 23.7798, longitude: 90.4064 },
        { latitude: 23.7788, longitude: 90.4064 },
      ],
    },
  });

  await seedFaqData();

  console.log('Park seed completed.');
  console.log(`Seeded ${sampleFaqs.length} sample FAQs.`);
  console.table([
    { label: 'releaserUserId', value: releaser.id },
    { label: 'seekerUserId', value: seeker.id },
    { label: 'adminUserId', value: admin.id },
    { label: 'activeHandoffId', value: activeHandoff.id },
    { label: 'acceptedHandoffId', value: acceptedHandoff.id },
    { label: 'paidSessionId', value: paidSession.id },
    { label: 'freeSessionId', value: freeSession.id },
    { label: 'paidAreaId', value: paidArea.id },
    { label: 'freeAreaId', value: freeArea.id },
  ]);
  console.log(`Demo password for seeded users: ${passwordPlain}`);
}

seedParkData()
  .catch((error) => {
    console.error('Park seed failed.');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
