const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('../dist/generated/prisma/client');

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

async function main() {
  loadLocalEnv();

  const prisma = new PrismaClient();
  const collectionName = 'saved_parking_locations';

  try {
    const result = await prisma.$runCommandRaw({ listIndexes: collectionName });
    const indexes = result?.cursor?.firstBatch ?? [];
    const legacyIndexes = indexes.filter((index) => (
      index.name === 'saved_parking_locations_userId_key'
      || (index.unique === true && index.key?.userId === 1)
    ));

    if (legacyIndexes.length === 0) {
      console.log('No legacy saved parking userId unique index found.');
      return;
    }

    for (const index of legacyIndexes) {
      await prisma.$runCommandRaw({
        dropIndexes: collectionName,
        index: index.name,
      });
      console.log(`Dropped legacy index: ${index.name}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Failed to drop legacy saved parking index.');
  console.error(error);
  process.exitCode = 1;
});
