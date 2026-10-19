const { execSync } = require('child_process');

console.log('🧪 Testing Qrouter Setup...\n');

// Test Node.js version
console.log('📦 Node.js version:', process.version);

// Test backend dependencies
try {
  console.log('🔧 Testing backend dependencies...');
  execSync('cd backend && npm list --depth=0', { stdio: 'pipe' });
  console.log('✅ Backend dependencies installed');
} catch (error) {
  console.log('❌ Backend dependencies issue');
}

// Test frontend dependencies
try {
  console.log('🎨 Testing frontend dependencies...');
  execSync('cd frontend && npm list --depth=0', { stdio: 'pipe' });
  console.log('✅ Frontend dependencies installed');
} catch (error) {
  console.log('❌ Frontend dependencies issue');
}

// Test TypeScript compilation
try {
  console.log('📝 Testing TypeScript compilation...');
  execSync('cd backend && npx tsc --noEmit', { stdio: 'pipe' });
  console.log('✅ Backend TypeScript compiles');
} catch (error) {
  console.log('❌ Backend TypeScript compilation issues');
}

console.log('\n🎉 Setup test complete!');
console.log('\n📋 Next steps:');
console.log('1. Install PostgreSQL and create database');
console.log('2. Run: npm run db:setup');
console.log('3. Run: npm run dev');