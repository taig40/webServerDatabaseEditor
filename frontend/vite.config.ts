import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Verifica se o arquivo .env existe. Se for a primeira vez, copia do .env-template.
// Depois, valida se todas as variáveis do .env-template estão preenchidas.
const envTemplatePath = path.resolve(__dirname, '.env-template')
const envPath = path.resolve(__dirname, '.env')

if (!fs.existsSync(envPath)) {
  if (fs.existsSync(envTemplatePath)) {
    fs.copyFileSync(envTemplatePath, envPath)
    console.log(`[*] Arquivo .env criado a partir de .env-template em ${envPath}`)
  } else {
    console.error(`[Erro] Arquivo .env-template não encontrado em ${envTemplatePath}`)
    process.exit(1)
  }
}

// Ler as variáveis necessárias do template
const requiredKeys: string[] = []
if (fs.existsSync(envTemplatePath)) {
  const content = fs.readFileSync(envTemplatePath, 'utf-8')
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const key = trimmed.split('=')[0].trim()
      if (key) requiredKeys.push(key)
    }
  })
}

// Ler as variáveis atuais do .env
const currentEnv: Record<string, string> = {}
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf-8')
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const parts = trimmed.split('=')
      const key = parts[0].trim()
      const value = parts.slice(1).join('=').trim()
      if (key) currentEnv[key] = value
    }
  })
}

// Validar se alguma variável obrigatória está vazia ou ausente
const missingKeys = requiredKeys.filter((key) => {
  const val = currentEnv[key]
  return val === undefined || val === ''
})

if (missingKeys.length > 0) {
  console.error(`\n[ERRO] Configuração incompleta no arquivo .env do Frontend!`)
  console.error(`As seguintes variáveis estão vazias ou ausentes e precisam ser preenchidas:`)
  missingKeys.forEach((key) => console.error(`  - ${key}`))
  console.error(`Por favor, edite o arquivo '${envPath}' e preencha-as antes de rodar o frontend.\n`)
  process.exit(1)
}

let targetApiUrl = currentEnv['VITE_API_URL']
if (targetApiUrl && !targetApiUrl.startsWith('http://') && !targetApiUrl.startsWith('https://')) {
  targetApiUrl = `http://${targetApiUrl}`
}

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: targetApiUrl,
        changeOrigin: true,
      },
    },
  },
})
