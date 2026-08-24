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

const sampleUsefulNumbers = [
  {
    title: 'Police',
    description: 'For police assistance',
    phone: '999',
    category: 'EMERGENCY_CONTACT',
    icon: 'police',
    sortOrder: 1,
    latitude: 23.7806,
    longitude: 90.4074,
  },
  {
    title: 'Ambulance',
    description: 'Medical emergency',
    phone: '999',
    category: 'EMERGENCY_CONTACT',
    icon: 'ambulance',
    sortOrder: 2,
    latitude: 23.781,
    longitude: 90.4078,
  },
  {
    title: 'Fire Brigade',
    description: 'Fire emergencies',
    phone: '999',
    category: 'EMERGENCY_CONTACT',
    icon: 'fire_truck',
    sortOrder: 3,
    latitude: 23.7799,
    longitude: 90.4068,
  },
  {
    title: 'Women Helpline',
    description: 'For women in distress',
    phone: '109',
    category: 'EMERGENCY_CONTACT',
    icon: 'women_helpline',
    sortOrder: 4,
    latitude: 23.7802,
    longitude: 90.4082,
  },
  {
    title: 'Roadside Assistance',
    description: '24*7 vehicle assistance',
    phone: '000',
    category: 'VEHICLE_ASSISTANCE',
    icon: 'roadside_assistance',
    sortOrder: 1,
    latitude: 23.7814,
    longitude: 90.4069,
  },
  {
    title: 'Tow Truck Services',
    description: 'For Vehicle Towing',
    phone: '000',
    category: 'VEHICLE_ASSISTANCE',
    icon: 'tow_truck',
    sortOrder: 2,
    latitude: 23.7795,
    longitude: 90.4076,
  },
  {
    title: 'Highway Helpline',
    description: 'For highway assistance',
    phone: '000',
    category: 'VEHICLE_ASSISTANCE',
    icon: 'highway',
    sortOrder: 3,
    latitude: 23.782,
    longitude: 90.4085,
  },
  {
    title: 'Traffic police',
    description: 'Traffic related assistance',
    phone: '000',
    category: 'TRAFFIC_AND_PARKING',
    icon: 'traffic_police',
    sortOrder: 1,
    latitude: 23.7808,
    longitude: 90.4062,
  },
  {
    title: 'Parking Support',
    description: 'For parking related support',
    phone: '000',
    category: 'TRAFFIC_AND_PARKING',
    icon: 'parking',
    sortOrder: 2,
    latitude: 23.7791,
    longitude: 90.4059,
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

async function seedUsefulNumberData() {
  await prisma.usefullNumber.deleteMany({
    where: {
      title: {
        in: sampleUsefulNumbers.map((number) => number.title),
      },
    },
  });

  await prisma.usefullNumber.createMany({
    data: sampleUsefulNumbers.map((number) => {
      const { latitude, longitude, ...numberData } = number;

      return {
        ...numberData,
        location: {
          latitude,
          longitude,
        },
        geolocation: {
          type: 'Point',
          coordinates: [longitude, latitude],
        },
        isActive: true,
      };
    }) as any,
  });
}

async function seedParkData() {
  const password = await bcrypt.hash(passwordPlain, 10);
  const { releaser, seeker, admin } = await upsertDemoUsers(password);
  const userIds = [releaser.id, seeker.id, admin.id];

  const seededAreaNames = [
    'Seed Central Paid Parking',
    'Seed Riverside Free Parking',
    'Seed Pending User Submission',
  ];

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
      name: { in: seededAreaNames },
    },
  });

  // Active, admin-managed parking areas with a polygon boundary already drawn.
  const paidArea = await prisma.parkingArea.create({
    data: {
      name: 'Seed Central Paid Parking',
      description: 'Seeded polygon for paid admin parking area',
      centerLat: 23.7806,
      centerLng: 90.4074,
      parkingCost: 'PAID',
      parkingFee: 20,
      parkingAreaTypes: ['ELECTRIC_CHARGING'],
      totalSpots: 4,
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
      parkingAreaTypes: ['DISABLED_FACILITY'],
      disabledFacilityLocation: 'ALL',
      totalSpots: 6,
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

  // A user drop-pin submission still awaiting an admin to draw the boundary and activate it.
  const pendingArea = await prisma.parkingArea.create({
    data: {
      name: 'Seed Pending User Submission',
      description: 'Drop-pin awaiting admin boundary + activation',
      centerLat: 23.7802,
      centerLng: 90.4071,
      parkingCost: 'FREE',
      parkingAreaTypes: ['ELECTRIC_CHARGING'],
      totalSpots: 3,
      isActive: false,
      createdById: seeker.id,
    },
  });

  // Saved parking locations are standalone user history entries.
  await prisma.savedParkingLocation.createMany({
    data: [
      {
        userId: releaser.id,
        name: paidArea.name,
        latitude: 23.7806,
        longitude: 90.4074,
        accuracy: 6,
        confidence: 0.93,
        source: 'AUTO',
        isActive: true,
        parkingType: 'PAID',
        paidExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
      {
        userId: seeker.id,
        name: freeArea.name,
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

  // AVAILABLE handoff linked to the paid area - try POST /park-relay/handoffs/:id/accept-and-park
  // as the seeker against this id to exercise the full claim+park flow end to end.
  const activeHandoff = await prisma.parkingHandoff.create({
    data: {
      releaserId: releaser.id,
      spotId: paidArea.id,
      latitude: 23.7806,
      longitude: 90.4074,
      status: 'AVAILABLE',
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    },
  });

  // Already-ACCEPTED handoff linked to the free area - useful for testing /occupied, /found, /cancel.
  const acceptedHandoff = await prisma.parkingHandoff.create({
    data: {
      releaserId: admin.id,
      seekerId: seeker.id,
      spotId: freeArea.id,
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
      spotId: paidArea.id,
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
      spotId: freeArea.id,
      latitude: 23.781,
      longitude: 90.4078,
      costType: 'FREE',
      status: 'ACTIVE',
    },
  });

  const rating = await prisma.parkingAreaRating.create({
    data: {
      parkingAreaId: paidArea.id,
      userId: seeker.id,
      rating: 5,
      review: 'Convenient paid spot near downtown, worked exactly as expected.',
    },
  });

  await prisma.parkingArea.update({
    where: { id: paidArea.id },
    data: { rating: 5, reviewCount: 1 },
  });

  await seedFaqData();
  await seedUsefulNumberData();

  console.log('Park seed completed.');
  console.log(`Seeded ${sampleFaqs.length} sample FAQs.`);
  console.log(`Seeded ${sampleUsefulNumbers.length} sample useful numbers.`);
  console.table([
    { label: 'releaserUserId', value: releaser.id },
    { label: 'seekerUserId', value: seeker.id },
    { label: 'adminUserId', value: admin.id },
    { label: 'paidAreaId (PAID, 4 spots, active)', value: paidArea.id },
    { label: 'freeAreaId (FREE, 6 spots, active)', value: freeArea.id },
    { label: 'pendingAreaId (FREE, 3 spots, isActive=false)', value: pendingArea.id },
    { label: 'activeHandoffId (AVAILABLE, spotId=paidArea)', value: activeHandoff.id },
    { label: 'acceptedHandoffId (ACCEPTED, spotId=freeArea)', value: acceptedHandoff.id },
    { label: 'paidSessionId', value: paidSession.id },
    { label: 'freeSessionId', value: freeSession.id },
    { label: 'ratingId', value: rating.id },
  ]);
  console.log('Try POST /park-relay/handoffs/{activeHandoffId}/accept-and-park as park_seeker to exercise the combined claim+park flow.');
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
