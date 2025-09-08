// server.js - Servidor Sicredi Dashboard Capture
import express from "express";
import cors from "cors";
import fs from "fs/promises";
import path from "path";
import puppeteer from "puppeteer";
import { fileURLToPath } from "url";
import fsExtra from "fs-extra";
import os from "os";

// === CONFIGURAÇÃO DE AMBIENTE ===
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Detectar ambiente
const isProduction = process.env.NODE_ENV === 'production';
const isRender = process.env.RENDER === 'true';

// Configurar diretórios baseado no ambiente
let PERSIST_DIR, PROFILE_DIR;

if (isRender) {
  // Ambiente Render
  PERSIST_DIR = process.env.PERSISTENT_DIR || "/opt/render/project/.cache";
  PROFILE_DIR = path.join(PERSIST_DIR, "chrome-profile");
} else if (isProduction) {
  // Outros ambientes de produção
  PERSIST_DIR = process.env.PERSISTENT_DIR || path.join(os.tmpdir(), "sicredi-data");
  PROFILE_DIR = path.join(PERSIST_DIR, "chrome-profile");
} else {
  // Ambiente local de desenvolvimento
  PERSIST_DIR = path.join(__dirname, ".cache");
  PROFILE_DIR = path.join(PERSIST_DIR, "chrome-profile");
}

// Criar diretórios necessários
try {
  fsExtra.ensureDirSync(PERSIST_DIR);
  fsExtra.ensureDirSync(PROFILE_DIR);
  console.log("🗂️  Perfil do Chrome:", PROFILE_DIR);
} catch (error) {
  console.warn("⚠️  Aviso ao criar diretórios:", error.message);
  // Fallback para pasta temporária
  PROFILE_DIR = path.join(os.tmpdir(), "sicredi-chrome-profile");
  fsExtra.ensureDirSync(PROFILE_DIR);
  console.log("🗂️  Usando perfil alternativo:", PROFILE_DIR);
}

const app = express();
app.use(cors());
app.use(express.json());

const COOKIES_PATH = path.join(__dirname, "cookies.json");
const PORT = process.env.PORT || 3001;

// === UTILITÁRIOS ===
function parseIntOr(v, d) { 
  const n = parseInt(v, 10); 
  return Number.isFinite(n) ? n : d; 
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Verificar se arquivo de cookies existe
async function checkCookiesFile() {
  try {
    await fs.access(COOKIES_PATH);
    return true;
  } catch {
    return false;
  }
}

// Aplicar cookies na página
async function applyCookies(page) {
  try {
    const cookiesExist = await checkCookiesFile();
    if (!cookiesExist) {
      console.warn("⚠️ Arquivo cookies.json não encontrado");
      return false;
    }

    const cookies = JSON.parse(await fs.readFile(COOKIES_PATH, 'utf-8'));
    const now = Date.now() / 1000;
    const valid = cookies.filter(c => !c.expires || c.expires > now);
    
    if (!valid.length) {
      console.warn("⚠️ Todos os cookies expiraram");
      return false;
    }

    const forDomain = d => valid.filter(c => (c.domain || '').includes(d));

    // 1) Cookies do Google (accounts, *.google.com)
    const googleCookies = forDomain('google.com');
    if (googleCookies.length) {
      await page.goto('https://accounts.google.com', { 
        waitUntil: 'domcontentloaded',
        timeout: 10000
      });
      await page.setCookie(...googleCookies);
      console.log(`🍪 ${googleCookies.length} cookies de google.com aplicados.`);
    }

    // 2) Cookies do Looker Studio
    const lookerCookies = forDomain('lookerstudio.google.com');
    if (lookerCookies.length) {
      await page.goto('https://lookerstudio.google.com', { 
        waitUntil: 'domcontentloaded',
        timeout: 10000
      });
      await page.setCookie(...lookerCookies);
      console.log(`🍪 ${lookerCookies.length} cookies de lookerstudio aplicados.`);
    }

    return (googleCookies.length + lookerCookies.length) > 0;
  } catch (e) {
    console.warn("⚠️ Falha ao aplicar cookies:", e.message);
    return false;
  }
}

// === ROTAS API ===

// Health check
app.get("/health", (_req, res) => {
  res.json({ 
    ok: true, 
    timestamp: new Date().toISOString(),
    service: "Sicredi Dashboard Capture",
    environment: {
      isProduction,
      isRender,
      profileDir: PROFILE_DIR,
      nodeVersion: process.version
    }
  });
});

// Status dos cookies
app.get("/status", async (_req, res) => {
  try {
    const cookiesExist = await checkCookiesFile();
    if (!cookiesExist) {
      return res.json({ 
        authenticated: false, 
        error: "cookies.json não encontrado. Execute 'npm run login' para fazer login.",
        cookiesFile: false,
        needsLogin: true,
        instructions: "Execute: npm run login"
      });
    }
    
    const cookiesData = await fs.readFile(COOKIES_PATH, 'utf-8');
    const cookies = JSON.parse(cookiesData);
    const now = Date.now() / 1000;
    const validCookies = cookies.filter(cookie => 
      !cookie.expires || cookie.expires > now
    );
    
    const isAuthenticated = validCookies.length > 0;
    
    res.json({
      authenticated: isAuthenticated,
      totalCookies: cookies.length,
      validCookies: validCookies.length,
      cookiesFile: true,
      needsLogin: !isAuthenticated,
      status: isAuthenticated ? "✅ Pronto para captura" : "❌ Cookies expirados - Execute 'npm run login'",
      environment: {
        profileDir: PROFILE_DIR,
        isLocal: !isProduction
      }
    });
  } catch (error) {
    res.json({ 
      authenticated: false, 
      error: error.message,
      cookiesFile: true,
      needsLogin: true
    });
  }
});

// Endpoint principal de captura
app.get("/capture", async (req, res) => {
  const targetUrl = req.query.url;
  const width = parseIntOr(req.query.w, 1400);
  const height = parseIntOr(req.query.h, 1500);

  console.log(`📸 Nova solicitação de captura: ${targetUrl} (${width}x${height})`);

  if (!targetUrl) {
    return res.status(400).json({ 
      ok: false, 
      error: "URL é obrigatória. Use: /capture?url=<url>&w=<width>&h=<height>" 
    });
  }

  let browser;
  try {
    // Configurar args do Puppeteer baseado no ambiente
    const puppeteerArgs = [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--lang=pt-BR",
      "--disable-web-security",
      "--disable-features=VizDisplayCompositor",
      "--disable-gpu",
      "--no-first-run",
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding"
    ];

    // Adicionar args específicos para ambientes diferentes
    if (isProduction) {
      puppeteerArgs.push(
        "--memory-pressure-off",
        "--max-old-space-size=4096"
      );
    }

    // Iniciar browser
    browser = await puppeteer.launch({
      headless: isProduction ? "new" : "new", // Sempre headless para captura
      args: puppeteerArgs,
      defaultViewport: { width, height },
      userDataDir: PROFILE_DIR,
      timeout: 30000
    });

    const page = await browser.newPage();
    
    // Configurar headers
    await page.setExtraHTTPHeaders({ 
      "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    });

    // Aplicar cookies salvos se não estiver usando perfil persistente
    const cookiesApplied = await applyCookies(page);
    if (!cookiesApplied) {
      await browser.close();
      return res.status(401).json({ 
        ok: false, 
        error: "Cookies inválidos ou expirados. Execute 'npm run login' para fazer login novamente.",
        needsLogin: true
      });
    }

    console.log("🌐 Carregando:", targetUrl);
    
    // Navegar para a URL
    const response = await page.goto(targetUrl, { 
      waitUntil: "networkidle2", 
      timeout: 60000 
    });

    if (!response.ok()) {
      throw new Error(`HTTP ${response.status()}: ${response.statusText()}`);
    }

    // Verificar se conseguiu carregar (não está na tela de login)
    const bodyText = await page.evaluate(() => 
      document.body.innerText.slice(0, 3000).toLowerCase()
    );
    
    // Verificar URL atual para detectar redirecionamento para login
    const currentUrl = page.url().toLowerCase();
    const isRedirectedToLogin = currentUrl.includes('accounts.google.com') || 
                               currentUrl.includes('signin') || 
                               currentUrl.includes('login');
    
    const loginKeywords = [
      'faça login', 'fazer login', 'sign in', 'login', 'entrar',
      'não é possível acessar', 'access denied', 'acesso negado',
      'você não tem permissão', 'permission denied', 'unauthorized',
      'session expired', 'sessão expirou', 'sessão inválida',
      'make sure you have access', 'verifique se você tem acesso',
      'something went wrong', 'algo deu errado',
      'unable to load', 'não foi possível carregar'
    ];
    
    const isLoginScreen = isRedirectedToLogin || loginKeywords.some(keyword => 
      bodyText.includes(keyword)
    );
    
    if (isLoginScreen) {
      console.warn("🔒 Tela de login detectada - cookies expirados ou inválidos");
      await browser.close();
      return res.status(401).json({ 
        ok: false, 
        error: "Sessão expirada. Execute 'npm run login' para renovar os cookies.",
        needsLogin: true,
        currentUrl: currentUrl
      });
    }

    // Aguardar renderização completa dos gráficos
    console.log("⏳ Aguardando renderização completa...");
    
    // Aguardar elementos específicos do Looker Studio carregarem
    try {
      await page.waitForSelector('iframe, canvas, svg, [data-selenium-id]', { 
        timeout: 10000 
      });
    } catch (e) {
      console.warn("⚠️ Elementos esperados não encontrados, continuando...");
    }
    
    await sleep(5000); // Aguardar 5 segundos adicionais para gráficos carregarem
    
    // Capturar screenshot
    const buffer = await page.screenshot({ 
      type: "png", 
      fullPage: false,
      clip: { x: 0, y: 0, width, height },
      encoding: 'binary'
    });
    
    const dataUrl = `data:image/png;base64,${buffer.toString("base64")}`;
    
    console.log("✅ Captura realizada com sucesso!");
    
    res.json({ 
      ok: true, 
      dataUrl,
      timestamp: new Date().toISOString(),
      dimensions: { width, height },
      url: targetUrl
    });

  } catch (err) {
    console.error("❌ Erro na captura:", err.message);
    
    let statusCode = 500;
    let errorMessage = "Falha na captura da imagem";
    
    if (err.message.includes('timeout') || err.message.includes('Navigation timeout')) {
      statusCode = 408;
      errorMessage = "Timeout ao carregar a página. Verifique se a URL está acessível.";
    } else if (err.message.includes('net::ERR_') || err.message.includes('HTTP')) {
      statusCode = 502;
      errorMessage = "Erro de conectividade ou página não encontrada";
    } else if (err.message.includes('Protocol error')) {
      statusCode = 500;
      errorMessage = "Erro do navegador. Tente novamente.";
    }
    
    res.status(statusCode).json({ 
      ok: false, 
      error: errorMessage,
      details: err.message,
      url: targetUrl,
      timestamp: new Date().toISOString()
    });
  } finally {
    if (browser) {
      try { 
        await browser.close(); 
      } catch (e) {
        console.warn("Erro ao fechar browser:", e.message);
      }
    }
  }
});

// Endpoint para testar conexão (sem captura)
app.get("/test-connection", async (req, res) => {
  const targetUrl = req.query.url || 'https://lookerstudio.google.com';
  
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
      userDataDir: PROFILE_DIR,
      timeout: 15000
    });

    const page = await browser.newPage();
    await applyCookies(page);
    
    const response = await page.goto(targetUrl, { 
      waitUntil: "domcontentloaded", 
      timeout: 15000 
    });
    
    const title = await page.title();
    const currentUrl = page.url();
    
    res.json({
      ok: true,
      url: targetUrl,
      currentUrl,
      title,
      status: response.status(),
      timestamp: new Date().toISOString()
    });
    
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message,
      url: targetUrl
    });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
});

// Servir arquivos estáticos da pasta raiz do projeto (um nível acima)
app.use(express.static(path.join(__dirname, '..'), {
  index: ['main.html', 'index.html']
}));

// Servir arquivos estáticos da pasta atual também
app.use(express.static(__dirname));

// Rota para servir o main.html na raiz
app.get("/", (_req, res) => {
  const mainHtmlPath = path.join(__dirname, '..', 'main.html');
  res.sendFile(mainHtmlPath, (err) => {
    if (err) {
      console.error("Erro ao servir main.html:", err.message);
      res.status(404).send(`
        <h1>Sicredi Dashboard Capture</h1>
        <h2>Arquivo main.html não encontrado</h2>
        <p>Certifique-se de que o arquivo main.html está na pasta raiz do projeto.</p>
        <h3>Estrutura esperada:</h3>
        <pre>
new_report_sicredi/
├── main.html                    ← Interface principal
├── pages-config.json           ← Configuração dos dashboards
└── sicredi-capture-server/
    ├── server.js               ← Este servidor
    ├── package.json
    ├── cookies.json            ← Cookies de autenticação
    └── refresh-cookies.js      ← Script de login
        </pre>
        <h3>Endpoints disponíveis:</h3>
        <ul>
          <li><a href="/health">/health</a> - Status do servidor</li>
          <li><a href="/status">/status</a> - Status dos cookies</li>
          <li>/capture?url=&lt;url&gt; - Capturar dashboard</li>
        </ul>
        <h3>Comandos úteis:</h3>
        <ul>
          <li><code>npm run login</code> - Fazer login no Google</li>
          <li><code>npm run status</code> - Verificar status</li>
          <li><code>npm run test</code> - Testar captura</li>
        </ul>
      `);
    }
  });
});

// Middleware de erro
app.use((err, req, res, next) => {
  console.error("Erro no servidor:", err.message);
  res.status(500).json({
    ok: false,
    error: "Erro interno do servidor",
    details: err.message,
    timestamp: new Date().toISOString()
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log("\n🚀 ===== SERVIDOR SICREDI INICIADO =====");
  console.log(`📍 URL: http://localhost:${PORT}`);
  console.log(`📋 Dashboard: http://localhost:${PORT}/main.html`);
  console.log(`🗂️  Perfil Chrome: ${PROFILE_DIR}`);
  console.log(`🌍 Ambiente: ${isProduction ? 'Produção' : 'Desenvolvimento'}`);
  console.log("\n📡 Endpoints disponíveis:");
  console.log("   GET / - Interface principal (main.html)");
  console.log("   GET /capture?url=<url>&w=<width>&h=<height> - Capturar dashboard");
  console.log("   GET /status - Status dos cookies");
  console.log("   GET /health - Health check");
  console.log("   GET /test-connection?url=<url> - Testar conexão");
  console.log("\n🔧 Comandos úteis:");
  console.log("   npm run login - Fazer login no Google");
  console.log("   npm run status - Verificar status dos cookies");
  console.log("   npm run test - Testar captura");
  console.log("==========================================\n");
});