import fs from 'node:fs';
import path from 'node:path';

const ROOT_DIR = path.resolve(__dirname, '..');
const FRONTEND_DIR = path.join(ROOT_DIR, 'frontend');
const SCREENS_DIR = path.join(FRONTEND_DIR, 'screens');

// 1. Update manifest
const manifestPath = path.join(FRONTEND_DIR, 'screens-manifest.json');
if (fs.existsSync(manifestPath)) {
  let manifestRaw = fs.readFileSync(manifestPath, 'utf-8');
  manifestRaw = manifestRaw.replace(/BharatAI/g, 'Samastha Samanvayam');
  manifestRaw = manifestRaw.replace(/Safar AI/g, 'Samastha Samanvayam');
  fs.writeFileSync(manifestPath, manifestRaw, 'utf-8');
  console.log('✓ Updated screens-manifest.json');
}

// 2. Update design tokens
const tokensPath = path.join(FRONTEND_DIR, 'design-tokens.json');
if (fs.existsSync(tokensPath)) {
  let tokensRaw = fs.readFileSync(tokensPath, 'utf-8');
  tokensRaw = tokensRaw.replace(/Safar AI Design System/g, 'Samastha Samanvayam Design System');
  fs.writeFileSync(tokensPath, tokensRaw, 'utf-8');
  console.log('✓ Updated design-tokens.json');
}

// 3. Update all screen HTML files
const screenFiles = fs.readdirSync(SCREENS_DIR).filter(f => f.endsWith('.html'));

for (const file of screenFiles) {
  const filePath = path.join(SCREENS_DIR, file);
  let content = fs.readFileSync(filePath, 'utf-8');

  // Replace text brandings
  content = content.replace(/BharatAI Travel/g, 'Samastha Samanvayam');
  content = content.replace(/BharatAI/g, 'Samastha Samanvayam');
  content = content.replace(/Safar AI Travel Intelligence/g, 'Samastha Samanvayam');
  content = content.replace(/Safar AI/g, 'Samastha Samanvayam');
  content = content.replace(/Smart India Hackathon/g, 'Samastha Samanvayam | Smart India Hackathon');

  // If there is a navbar logo placeholder or icon, make sure logo.png can be displayed
  fs.writeFileSync(filePath, content, 'utf-8');
  console.log(`✓ Rebranded screen: ${file}`);
}

console.log('All screens successfully updated with SAMASTHA SAMANVAYAM branding!');
