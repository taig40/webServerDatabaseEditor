import os
import sys

# Add the current directory to python path so we can import app
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.core.security import obfuscate

def obfuscate_dotenv(filepath: str):
    if not os.path.exists(filepath):
        print(f"Error: {filepath} does not exist.")
        return
        
    lines = []
    updated = False
    with open(filepath, 'r', encoding='utf-8') as f:
        for line in f:
            stripped = line.strip()
            if stripped and not stripped.startswith('#') and '=' in line:
                parts = line.split('=', 1)
                key = parts[0].strip()
                val = parts[1].strip()
                # If there's a comment at the end of the line, like: VAL # comment
                # we should be careful. But standard .env usually has simple key=val or quotes.
                if val and not val.startswith('obf:'):
                    # Remove surrounding quotes if any
                    for quote in ['"', "'"]:
                        if val.startswith(quote) and val.endswith(quote) and len(val) >= 2:
                            val = val[1:-1]
                            break
                    obf_val = obfuscate(val)
                    lines.append(f"{key}={obf_val}\n")
                    print(f"Obfuscated {key}")
                    updated = True
                else:
                    lines.append(line)
            else:
                lines.append(line)
                
    if updated:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.writelines(lines)
        print(f"Successfully obfuscated variables in {filepath}")
    else:
        print(f"No plain-text variables to obfuscate in {filepath}")

if __name__ == '__main__':
    base_dir = os.path.dirname(os.path.abspath(__file__))
    env_path = os.path.join(base_dir, ".env")
    print(f"Scanning {env_path} for variables to obfuscate...")
    obfuscate_dotenv(env_path)
