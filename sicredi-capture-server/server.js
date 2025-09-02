// server.js - Servidor Sicredi Dashboard Capture
import express from "express";
import cors from "cors";
import fs from "fs/promises";
import path from "path";
import puppeteer from "puppeteer";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

const COOKIES_PATH = path.join(__dirname, "cookies.json");
const PORT = process.env.PORT || 3001;

// Utilitários
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
// server.js
async function applyCookies(page) {
  try {
    await fs.access(COOKIES_PATH);
    const cookies = JSON.parse(await fs.readFile(COOKIES_PATH, 'utf-8'));

    const now = Date.now() / 1000;
    const valid = cookies.filter(c => !c.expires || c.expires > now);
    if (!valid.length) return false;

    const forDomain = d => valid.filter(c => (c.domain || '').includes(d));

    // 1) Cookies do Google (accounts, *.google.com)
    const googleCookies = forDomain('google.com');
    if (googleCookies.length) {
      await page.goto('https://accounts.google.com', { waitUntil: 'domcontentloaded' });
      await page.setCookie(...googleCookies);
      console.log(`🍪 ${googleCookies.length} cookies de google.com aplicados.`);
    }

    // 2) Cookies do Looker Studio
    const lookerCookies = forDomain('lookerstudio.google.com');
    if (lookerCookies.length) {
      await page.goto('https://lookerstudio.google.com', { waitUntil: 'domcontentloaded' });
      await page.setCookie(...lookerCookies);
      console.log(`🍪 ${lookerCookies.length} cookies de lookerstudio aplicados.`);
    }

    return (googleCookies.length + lookerCookies.length) > 0;
  } catch (e) {
    console.warn("⚠️ Falha ao aplicar cookies:", e.message);
    return false;
  }
}


// ROTAS API

// Health check
app.get("/health", (_req, res) => {
  res.json({ 
    ok: true, 
    timestamp: new Date().toISOString(),
    service: "Sicredi Dashboard Capture"
  });
});

// Status dos cookies
app.get("/status", async (_req, res) => {
  try {
    const cookiesExist = await checkCookiesFile();
    if (!cookiesExist) {
      return res.json({ 
        authenticated: false, 
        error: "cookies.json não encontrado",
        cookiesFile: false
      });
    }
    
    const cookiesData = await fs.readFile(COOKIES_PATH, 'utf-8');
    const cookies = JSON.parse(cookiesData);
    const now = Date.now() / 1000;
    const validCookies = cookies.filter(cookie => 
      !cookie.expires || cookie.expires > now
    );
    
    res.json({
      authenticated: validCookies.length > 0,
      totalCookies: cookies.length,
      validCookies: validCookies.length,
      cookiesFile: true,
      status: validCookies.length > 0 ? "✅ Pronto para captura" : "❌ Cookies expirados"
    });
  } catch (error) {
    res.json({ 
      authenticated: false, 
      error: error.message,
      cookiesFile: true
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
      error: "URL é obrigatória" 
    });
  }

  let browser;
  try {
    // Iniciar browser
    browser = await puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--lang=pt-BR",
        "--disable-web-security",
        "--disable-features=VizDisplayCompositor",
        "--disable-gpu",
        "--no-first-run"
      ],
      defaultViewport: { width, height },
    });

    const page = await browser.newPage();
    
    // Configurar headers
    await page.setExtraHTTPHeaders({ 
      "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    });

    // Aplicar cookies salvos
    const cookiesApplied = await applyCookies(page);
    if (!cookiesApplied) {
      await browser.close();
      return res.status(401).json({ 
        ok: false, 
        error: "Cookies inválidos ou expirados. Execute o comando 'npm run status' para verificar." 
      });
    }

    console.log("🌐 Carregando:", targetUrl);
    
    // Navegar para a URL
    await page.goto(targetUrl, { 
      waitUntil: "networkidle2", 
      timeout: 60000 
    });

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
      console.warn("🔒 Tela de login detectada - cookies podem ter expirado");
      await browser.close();
      return res.status(401).json({ 
        ok: false, 
        error: "Sessão expirada. Cookies precisam ser renovados." 
      });
    }

    // Aguardar renderização completa dos gráficos
    console.log("⏳ Aguardando renderização completa...");
    await sleep(5000); // Aguardar 5 segundos para gráficos carregarem
    
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
      dimensions: { width, height }
    });

  } catch (err) {
    console.error("❌ Erro na captura:", err.message);
    
    let statusCode = 500;
    let errorMessage = "Falha na captura da imagem";
    
    if (err.message.includes('timeout')) {
      statusCode = 408;
      errorMessage = "Timeout ao carregar a página";
    } else if (err.message.includes('net::ERR_')) {
      statusCode = 502;
      errorMessage = "Erro de conectividade";
    }
    
    res.status(statusCode).json({ 
      ok: false, 
      error: errorMessage,
      details: err.message,
      url: targetUrl
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
        <h1>Arquivo main.html não encontrado</h1>
        <p>Certifique-se de que o arquivo main.html está na pasta raiz do projeto.</p>
        <p>Estrutura esperada:</p>
        <pre>
new_report_sicredi/
├── main.html
├── pages-config.json
└── sicredi-capture-server/
    ├── server.js
    ├── package.json
    └── cookies.json
        </pre>
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
    details: err.message
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log("\n🚀 ===== SERVIDOR SICREDI INICIADO =====");
  console.log(`📍 URL: http://localhost:${PORT}`);
  console.log(`📋 Dashboard: http://localhost:${PORT}/main.html`);
  console.log("\n📡 Endpoints disponíveis:");
  console.log("   GET / - Interface principal (main.html)");
  console.log("   GET /capture?url=<url>&w=<width>&h=<height> - Capturar dashboard");
  console.log("   GET /status - Status dos cookies");
  console.log("   GET /health - Health check");
  console.log("\n🔧 Comandos úteis:");
  console.log("   npm run status - Verificar status dos cookies");
  console.log("   npm run test - Testar captura");
  console.log("==========================================\n");
});