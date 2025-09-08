// refresh-cookies.js
import puppeteer from 'puppeteer';
import fs from 'fs/promises';
import path from 'path';

const COOKIES_PATH = './cookies.json';
const TEST_URL = 'https://lookerstudio.google.com/embed/reporting/475a3c3e-e6f6-4341-a5d2-c493f486d380/page/p_i6m9xrzjtd';

async function refreshCookies() {
  console.log('🔄 Iniciando renovação de cookies...');
  
  const browser = await puppeteer.launch({ 
    headless: false, // Mostra o browser para você fazer login
    defaultViewport: { width: 1200, height: 800 }
  });
  
  try {
    const page = await browser.newPage();
    
    console.log('🌐 Navegando para o Looker Studio...');
    await page.goto('https://accounts.google.com/signin');
    
    console.log('⏳ Aguardando login manual...');
    console.log('👤 Por favor:');
    console.log('   1. Faça login com sua conta @suno.com.br');
    console.log('   2. Após logar, navegue para um dashboard do Looker Studio');
    console.log('   3. Aguarde o dashboard carregar completamente');
    console.log('   4. Pressione ENTER neste terminal para continuar...');
    
    // Aguardar input do usuário
    process.stdin.setRawMode(true);
    process.stdin.resume();
    await new Promise(resolve => process.stdin.once('data', resolve));
    process.stdin.setRawMode(false);
    process.stdin.pause();
    
    console.log('🍪 Coletando cookies...');
    
    // Navegar para o dashboard para garantir que os cookies estão atualizados
    await page.goto(TEST_URL, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Obter todos os cookies
    const cookies = await page.cookies();
    
    // Filtrar cookies importantes do Google
    const importantCookies = cookies.filter(cookie => 
      cookie.domain.includes('google.com') || 
      cookie.domain.includes('lookerstudio.google.com')
    );
    
    if (importantCookies.length === 0) {
      throw new Error('Nenhum cookie do Google encontrado');
    }
    
    // Salvar cookies
    await fs.writeFile(COOKIES_PATH, JSON.stringify(importantCookies, null, 2));
    
    console.log(`✅ ${importantCookies.length} cookies salvos em ${COOKIES_PATH}`);
    
    // Testar os cookies
    console.log('🧪 Testando cookies...');
    const newPage = await browser.newPage();
    await newPage.goto('https://lookerstudio.google.com', { waitUntil: 'domcontentloaded' });
    await newPage.setCookie(...importantCookies);
    
    const title = await newPage.title();
    console.log(`📊 Página carregada: ${title}`);
    
    if (title.includes('Sign in') || title.includes('Login')) {
      throw new Error('Cookies não funcionaram - ainda está pedindo login');
    }
    
    console.log('🎉 Cookies renovados com sucesso!');
    console.log('💡 Agora você pode usar o sistema normalmente.');
    
  } catch (error) {
    console.error('❌ Erro ao renovar cookies:', error.message);
  } finally {
    await browser.close();
  }
}

refreshCookies();