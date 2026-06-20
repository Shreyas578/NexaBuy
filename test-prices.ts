import { verifyProductMatch } from './lib/groq';

async function run() {
  console.log('Testing Matching: Sony Mainstream');
  const match1 = await verifyProductMatch(
    "Sony WH-1000XM5 Wireless Headphones",
    "Sony WH-1000XM5 Premium Noise Canceling Headphones"
  );
  console.log('Match 1:', match1);

  console.log('\nTesting Matching: NIBOSI Niche');
  const match2 = await verifyProductMatch(
    "NIBOSI Analog Watch",
    "NIBOSI Women Fashion Watch Diamond Analog Quartz Female Watch"
  );
  console.log('Match 2:', match2);
}

run();

run();
