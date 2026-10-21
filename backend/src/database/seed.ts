import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding Qrouter database...');

  // Create default organization
  const org = await prisma.organization.upsert({
    where: { slug: 'qrouter' },
    update: {},
    create: {
      name: 'Qrouter ISP',
      slug: 'qrouter',
      email: 'admin@qrouter.com',
      phone: '+254700000000',
      city: 'Nairobi',
      country: 'KE',
      currency: 'KES',
      taxRate: 0.16,
      subscriptionPlan: 'pro',
      isActive: true
    }
  });

  console.log('✅ Organization created:', org.name, '(ID:', org.id, ')');

  // Create admin user
  const hashedPassword = await bcrypt.hash('Checkmate123!', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@qrouter.com' },
    update: {},
    create: {
      email: 'admin@qrouter.com',
      phone: '+254700000000',
      password: hashedPassword,
      username: 'Ken',
      firstName: 'Ken',
      lastName: 'User',
      role: 'SUPER_ADMIN',
      organizationId: org.id,
      isActive: true
    }
  });

  console.log('✅ Admin user created:', admin.email);

  // Create default plans
  const plans = [
    {
      name: 'Basic 1 Hour',
      description: 'Perfect for quick browsing and social media',
      price: 20,
      duration: 1,
      dataLimit: '500MB',
      speedLimit: '5Mbps',
      isActive: true
    },
    {
      name: 'Standard 6 Hours',
      description: 'Great for work and entertainment',
      price: 100,
      duration: 6,
      dataLimit: '2GB',
      speedLimit: '10Mbps',
      isActive: true
    },
    {
      name: 'Premium 24 Hours',
      description: 'Full day unlimited access',
      price: 300,
      duration: 24,
      dataLimit: '10GB',
      speedLimit: '20Mbps',
      isActive: true
    },
    {
      name: 'Weekly Package',
      description: 'Perfect for extended stays',
      price: 1500,
      duration: 168, // 7 days
      dataLimit: '50GB',
      speedLimit: '25Mbps',
      isActive: true
    },
    {
      name: 'Monthly Unlimited',
      description: 'Ultimate internet freedom',
      price: 5000,
      duration: 720, // 30 days
      dataLimit: 'Unlimited',
      speedLimit: '50Mbps',
      isActive: true
    }
  ];

  // Delete existing plans and create new ones for this organization
  await prisma.plan.deleteMany({
    where: { organizationId: org.id }
  });

  const plansWithOrg = plans.map(plan => ({ ...plan, organizationId: org.id }));

  const createdPlans = await prisma.plan.createMany({
    data: plansWithOrg
  });

  console.log(`✅ Created ${createdPlans.count} plans`);

  // Create default RBAC roles for the organization
  const roleDefinitions = [
    { name: 'ADMIN', description: 'Full administrative access', permissions: ['*'] },
    { name: 'TECHNICIAN', description: 'Network and router operations', permissions: ['sessions.*', 'nas.*', 'plans.read'] },
    { name: 'SUPPORT', description: 'Customer support and ticketing', permissions: ['users.read', 'tickets.*', 'sessions.read'] },
    { name: 'AGENT', description: 'Reseller / field agent', permissions: ['users.create', 'payments.read', 'vouchers.*'] },
    { name: 'CUSTOMER', description: 'Self-service customer', permissions: ['sessions.read', 'payments.read'] }
  ];

  for (const role of roleDefinitions) {
    await prisma.role.upsert({
      where: { organizationId_name: { organizationId: org.id, name: role.name } },
      update: { description: role.description, permissions: role.permissions },
      create: { ...role, organizationId: org.id, isSystem: true }
    });
  }

  console.log(`✅ Created ${roleDefinitions.length} default roles`);

  // Default captive portal branding for the organization
  await prisma.captivePortalConfig.upsert({
    where: { organizationId: org.id },
    update: {},
    create: {
      organizationId: org.id,
      title: `Welcome to ${org.name}`,
      subtitle: 'Connect. Pay. Browse — Seamlessly.',
      primaryColor: '#2563eb',
      supportPhone: org.phone,
      supportEmail: org.email
    }
  });

  console.log('✅ Captive portal configuration created');

  console.log('🎉 Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });