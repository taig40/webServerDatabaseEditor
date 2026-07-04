import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function obfuscate(value) {
  if (!value) return '';
  const buffer = Buffer.from(value, 'utf-8');
  return 'obf:' + buffer.toString('base64');
}

function obfuscateDotenv(filepath) {
  if (!fs.existsSync(filepath)) {
    console.error(`Error: ${filepath} does not exist.`);
    return;
  }
  
  const content = fs.readFileSync(filepath, 'utf-8');
  const lines = content.split(/\r?\n/);
  const updatedLines = [];
  let updated = false;
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const parts = line.split('=');
      const key = parts[0].trim();
      let val = parts.slice(1).join('=').trim();
      
      if (val && !val.startsWith('obf:')) {
        for (const quote of ['"', "'"]) {
          if (val.startsWith(quote) && val.endsWith(quote) && val.length >= 2) {
            val = val.slice(1, -1);
            break;
          }
        }
        const obfVal = obfuscate(val);
        updatedLines.push(`${key}=${obfVal}`);
        console.log(`Obfuscated ${key}`);
        updated = true;
      } else {
        updatedLines.push(line);
      }
    } else {
      updatedLines.push(line);
    }
  }
  
  if (updated) {
    fs.writeFileSync(filepath, updatedLines.join('\n'), 'utf-8');
    console.log(`Successfully obfuscated variables in ${filepath}`);
  } else {
    console.log(`No plain-text variables to obfuscate in ${filepath}`);
  }
}

const envPath = path.resolve(__dirname, '.env');
console.log(`Scanning ${envPath} for variables to obfuscate...`);
obfuscateDotenv(envPath);
