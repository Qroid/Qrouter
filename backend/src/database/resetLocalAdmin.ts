import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV !== 'development') {
    throw new Error('Temporary admin credentials may only be applied in development.');
  }
  const admin = await prisma.user.findUnique({ where: { email: 'admin@qrouter.com' } });
  if (!admin || !['ADMIN', 'SUPER_ADMIN'].includes(admin.role)) {
    throw new Error('Seeded admin not found. Initialize a new development database first.');
  }
  await prisma.user.update({
    where: { id: admin.id },
    data: { username: 'Ken', firstName: 'Ken', password: await bcrypt.hash('Checkmate123!', 10) }
  });
  console.log('Local admin credentials updated. Existing plans and customer data were not changed.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
