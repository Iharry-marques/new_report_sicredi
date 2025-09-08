// refresh-cookies.js - Script de Login Melhorado
import puppeteer from 'puppeteer';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const COOKIES_PATH = path.join(__dirname, 'cookies.json');
const TEST_URLS = [
  'https://lookerstudio.google.com/embed/reporting/475a3c3e-e6f6-4341-a5d2-c493f486d380/page/p_i6m9xrzjtd',
  'https://lookerstudio.google.com/embed/reporting/e747cd62-1085-43f8-8d4a-4d993140c8b1/page/p_hp7fdemgvd'
];

// Utilitário para aguardar input do usuário
function waitForInput(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise(resolve => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

// Verificar se já existem cookies válidos
async function checkExistingCookies() {
  try {
    const cookiesData = await fs.readFile(COOKIES_PATH, 'utf-8');
    const cookies = JSON.parse(cookiesData);
    const now = Date.now() / 1000;
    const validCookies = cookies.filter(cookie => 
      !cookie.expires || cookie.expires > now
    );
    
    return {
      exists: true,
      total: cookies.length,
      valid: validCookies.length,
      hasValid: validCookies.length > 0
    };
  } catch {
    return { exists: false, total: 0, valid: 0, hasValid: false };
  }
}

// Testar se os cookies funcionam
async function testCookies(cookies) {
  console.log('🧪 Testando cookies...');
  
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-dev-shm-usage"]
  });
  
  try {
    const page = await browser.newPage();
    
    // Aplicar cookies do Google
    const googleCookies = cookies.filter(c => c.domain.includes('google.com'));
    if (googleCookies.length) {
      await page.goto('https://accounts.google.com', { waitUntil: 'domcontentloaded' });
      await page.setCookie(...googleCookies);
    }
    
    // Aplicar cookies do Looker Studio
    const lookerCookies = cookies.filter(c => c.domain.includes('lookerstudio.google.com'));
    if (lookerCookies.length) {
      await page.goto('https://lookerstudio.google.com', { waitUntil: 'domcontentloaded' });
      await page.setCookie(...lookerCookies);
    }
    
    // Testar acesso a um dashboard
    await page.goto(TEST_URLS[0], { waitUntil: 'domcontentloaded', timeout: 15000 });
    
    const title = await page.title();
    const url = page.url();
    
    // Verificar se redirecionou para login
    const isLoginPage = url.includes('accounts.google.com') || 
                       url.includes('signin') || 
                       title.toLowerCase().includes('sign in');
    
    if (isLoginPage) {
      return { success: false, error: 'Redirecionado para página de login' };
    }
    
    // Verificar conteúdo da página
    const bodyText = await page.evaluate(() => 
      document.body.innerText.slice(0, 1000).toLowerCase()
    );
    
    const hasLoginKeywords = [
      'faça login', 'fazer login', 'sign in', 'login', 'entrar'
    ].some(keyword => bodyText.includes(keyword));
    
    if (hasLoginKeywords) {
      return { success: false, error: 'Página contém indicadores de login necessário' };
    }
    
    return { 
      success: true, 
      title: title.slice(0, 100),
      url: url 
    };
    
  } catch (error) {
    return { success: false, error: error.message };
  } finally {
    await browser.close();
  }
}

async function refreshCookies() {
  console.log('\n🔄 ===== SICREDI - RENOVAÇÃO DE COOKIES =====\n');
  
  // Verificar cookies existentes
  const existing = await checkExistingCookies();
  
  if (existing.exists) {
    console.log(`📊 Status atual:`);
    console.log(`   Total de cookies: ${existing.total}`);
    console.log(`   Cookies válidos: ${existing.valid}`);
    console.log(`   Status: ${existing.hasValid ? '✅ Válidos' : '❌ Expirados'}\n`);
    
    if (existing.hasValid) {
      const answer = await waitForInput('Já existem cookies válidos. Deseja renovar mesmo assim? (y/N): ');
      if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
        console.log('✅ Mantendo cookies existentes.');
        return;
      }
    }
  } else {
    console.log('📊 Nenhum cookie encontrado. Primeiro login necessário.\n');
  }
  
  const browser = await puppeteer.launch({ 
    headless: false, // Mostra o browser para login manual
    defaultViewport: { width: 1200, height: 800 },
    args: [
      "--no-sandbox",
      "--disable-web-security"
    ]
  });
  
  try {
    const page = await browser.newPage();
    
    console.log('🌐 Abrindo página de login do Google...');
    await page.goto('https://accounts.google.com/signin', { 
      waitUntil: 'domcontentloaded' 
    });
    
    console.log('\n👤 INSTRUÇÕES DE LOGIN:');
    console.log('   1. Faça login com sua conta @suno.com.br (ou conta com acesso)');
    console.log('   2. Complete qualquer verificação em 2 etapas se solicitada');
    console.log('   3. Após o login, navegue para https://lookerstudio.google.com');
    console.log('   4. Verifique se consegue acessar os dashboards');
    console.log('   5. Volte aqui e pressione ENTER para continuar...\n');
    
    // Aguardar confirmação do usuário
    await waitForInput('Pressione ENTER após completar o login: ');
    
    console.log('🍪 Coletando cookies...');
    
    // Navegar para Looker Studio para garantir que os cookies estão completos
    try {
      await page.goto('https://lookerstudio.google.com', { 
        waitUntil: 'domcontentloaded',
        timeout: 15000 
      });
      
      // Aguardar um pouco para cookies adicionais serem definidos
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Testar acesso a um dashboard específico
      await page.goto(TEST_URLS[0], { 
        waitUntil: 'domcontentloaded',
        timeout: 15000 
      });
      
    } catch (error) {
      console.warn(`⚠️ Aviso ao navegar: ${error.message}`);
    }
    
    // Obter todos os cookies
    const allCookies = await page.cookies();
    
    // Filtrar cookies importantes
    const importantCookies = allCookies.filter(cookie => {
      const domain = cookie.domain.toLowerCase();
      return domain.includes('google.com') || 
             domain.includes('lookerstudio.google.com') ||
             domain.includes('googleapis.com');
    });
    
    if (importantCookies.length === 0) {
      throw new Error('❌ Nenhum cookie do Google encontrado. Verifique se o login foi concluído.');
    }
    
    // Salvar cookies
    await fs.writeFile(COOKIES_PATH, JSON.stringify(importantCookies, null, 2));
    console.log(`✅ ${importantCookies.length} cookies salvos em ${COOKIES_PATH}`);
    
    // Testar os cookies
    const testResult = await testCookies(importantCookies);
    
    if (testResult.success) {
      console.log('🎉 SUCESSO! Cookies funcionando corretamente.');
      console.log(`📊 Dashboard testado: ${testResult.title}`);
      console.log('\n💡 Próximos passos:');
      console.log('   1. Execute: npm start (para iniciar o servidor)');
      console.log('   2. Acesse: http://localhost:3001');
      console.log('   3. Use o sistema normalmente');
    } else {
      console.warn(`⚠️ Aviso: ${testResult.error}`);
      console.log('💡 Os cookies foram salvos, mas pode ser necessário tentar novamente.');
    }
    
  } catch (error) {
    console.error('❌ Erro durante o processo:', error.message);
    console.log('\n🔧 Dicas para resolução:');
    console.log('   • Certifique-se de que fez login completamente');
    console.log('   • Verifique se tem acesso aos dashboards do Looker Studio');
    console.log('   • Tente executar o comando novamente');
    console.log('   • Se persistir, verifique sua conexão de internet');
  } finally {
    await browser.close();
  }
}

// Verificar se é execução direta
if (import.meta.url === `file://${process.argv[1]}`) {
  refreshCookies().catch(console.error);
}