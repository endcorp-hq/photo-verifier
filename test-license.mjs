import { 
  createDemoLicenseKey, 
  decodeLicenseKey, 
  UsageTracker,
  LICENSE_TIERS 
} from './packages/blockchain/src/license.js';

console.log('=== License System Test ===\n');

// Test creating demo keys
console.log('Available tiers:');
for (const [tier, config] of Object.entries(LICENSE_TIERS)) {
  console.log(`  - ${tier}: ${config.name} (${config.maxPhotos === -1 ? 'unlimited' : config.maxPhotos} photos)`);
}

console.log('\nCreating demo license key...');
const demoKey = createDemoLicenseKey('startup');
console.log('Key:', demoKey.substring(0, 40) + '...\n');

console.log('Validating license...');
const result = decodeLicenseKey(demoKey, 'demo-secret-change-in-production');
console.log('Valid:', result.valid);
console.log('Tier:', result.license?.tier);
console.log('Max photos:', result.license?.maxPhotos);
console.log('Features:', result.license?.features.join(', '));

if (result.valid && result.license) {
  console.log('\nTesting usage tracker...');
  const tracker = new UsageTracker(result.license);
  
  console.log('Recording 5 photos...');
  for (let i = 0; i < 5; i++) {
    const recorded = tracker.recordPhoto();
    console.log(`  Photo ${i + 1}: ${recorded ? 'recorded' : 'REJECTED'}`);
  }
  
  console.log('Count:', tracker.getPhotoCount());
  console.log('Remaining:', tracker.getRemainingPhotos());
  
  console.log('\nTrying to exceed limit...');
  for (let i = 0; i < 1000; i++) {
    if (!tracker.recordPhoto()) {
      console.log(`Limit reached at photo ${tracker.getPhotoCount()}`);
      break;
    }
  }
}

console.log('\n__LICENSE__OK');
