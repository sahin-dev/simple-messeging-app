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

const usefulNumbers = [
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

async function main() {
  loadLocalEnv();

  const prisma = new PrismaClient();
  const now = new Date();

  try {
    for (const number of usefulNumbers) {
      const { latitude, longitude, ...numberData } = number;

      await prisma.$runCommandRaw({
        update: 'useful_numbers',
        updates: [
          {
            q: { title: number.title },
            u: {
              $set: {
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
                updatedAt: now,
              },
              $setOnInsert: {
                createdAt: now,
              },
            },
            upsert: true,
          },
        ],
      });
    }

    const result = await prisma.$runCommandRaw({
      find: 'useful_numbers',
      filter: {
        title: {
          $in: usefulNumbers.map((number) => number.title),
        },
      },
      projection: {
        _id: 0,
        title: 1,
        phone: 1,
        category: 1,
        sortOrder: 1,
        isActive: 1,
        location: 1,
        geolocation: 1,
      },
      sort: {
        category: 1,
        sortOrder: 1,
      },
    });

    const seeded = (result as any)?.cursor?.firstBatch ?? [];
    console.log(`Seeded ${seeded.length} useful numbers.`);
    console.table(seeded);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Useful number seed failed.');
  console.error(error);
  process.exitCode = 1;
});
