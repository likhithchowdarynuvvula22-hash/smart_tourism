import fs from 'node:fs';
import path from 'node:path';

const SCREENS_DIR = path.resolve(__dirname, '../frontend/screens');
const screenFiles = fs.readdirSync(SCREENS_DIR).filter(f => f.endsWith('.html'));

for (const file of screenFiles) {
  const filePath = path.join(SCREENS_DIR, file);
  let content = fs.readFileSync(filePath, 'utf-8');

  // Replace generic explore icon near Samastha Samanvayam with logo img
  content = content.replace(
    /<span class="material-symbols-outlined"[^>]*>explore<\/span>\s*Samastha Samanvayam/g,
    '<img src="../assets/logo.png" alt="Logo" class="w-7 h-7 object-contain rounded-md bg-white/10 p-0.5 inline-block" /> Samastha Samanvayam'
  );

  content = content.replace(
    /<span class="material-symbols-outlined"[^>]*>travel_explore<\/span>\s*Samastha Samanvayam/g,
    '<img src="../assets/logo.png" alt="Logo" class="w-7 h-7 object-contain rounded-md bg-white/10 p-0.5 inline-block" /> Samastha Samanvayam'
  );

  fs.writeFileSync(filePath, content, 'utf-8');
}

console.log('✓ Injected team logo into screen navigation headers');
