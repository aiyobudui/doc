const fs = require('fs');
const path = require('path');

// 调试标识
const DEBUG = process.env.NETLIFY_DEV === 'true';

// 安全读取文件方法（带详细错误日志）
const readFileSafe = (filePath) => {
  try {
    if (DEBUG) console.log(`尝试读取文件: ${filePath}`);
    const content = fs.readFileSync(filePath, 'utf-8');
    if (DEBUG) console.log(`成功读取 ${filePath}`);
    return content;
  } catch (error) {
    if (DEBUG) console.error(`文件读取失败 ${filePath}:`, error.message);
    return null;
  }
};

// 需要排除的路由列表
const EXCLUDED_ROUTES = [
  '/zh-cn/bbs',
  '/zh-cn/dashang'
];

// 增强版XML转义
const escapeXML = (str) => {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&apos;',
    '"': '&quot;'
  })[char] || char);
};

// 增强版URL编码处理
const encodeURL = (url) => {
  if (!url) return '';
  return encodeURI(url)
    .replace(/&/g, '&amp;')
    .replace(/\+/g, '%2B')
    .replace(/%20/g, '+');
};

// 主处理函数
exports.handler = async (event, context) => {
  if (DEBUG) console.log('收到请求:', event.path);

  // 1. 多路径探测 _sidebar.md
  const sidebarPaths = [
    path.join(__dirname, '_sidebar.md'),
    path.join(__dirname, '../../docs/_sidebar.md')
  ];

  let sidebarContent = '';
  for (const p of sidebarPaths) {
    sidebarContent = readFileSafe(p);
    if (sidebarContent) break;
  }

  // 2. 解析路由逻辑（带容错处理）
  let routes = ['/zh-cn/']; // 默认包含首页

  if (sidebarContent) {
    try {
      routes = [
        ...new Set(
          (sidebarContent.match(/\]\(([^)#]+)/g) || [])
            .map(match => {
              const route = match.slice(2).replace('.md', '');
              return route.startsWith('/') ? route : `/${route}`;
            })
            .filter(route =>
              !EXCLUDED_ROUTES.some(excluded =>
                route === excluded ||
                route.startsWith(`${excluded}/`)
              )
            )
        )
      ];

      // 确保至少包含首页
      if (!routes.includes('/zh-cn/')) {
        routes.push('/zh-cn/');
      }
    } catch (error) {
      console.error('路由解析错误:', error);
    }
  }

  if (DEBUG) console.log('生成的路由:', routes);

  // 3. 生成XML（带完整错误处理）
  try {
    const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${routes.filter(Boolean).map(route => {
      const cleanRoute = route.replace(/\/+$/, ''); // 移除末尾斜杠
      const encodedRoute = encodeURL(cleanRoute);
      const escapedRoute = escapeXML(encodedRoute);

      return `
  <url>
    <loc>https://www.haozy.top${escapedRoute}</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${route === '/zh-cn/' ? '1.0' : '0.8'}</priority>
  </url>`;
    }).join('')}
</urlset>`;

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'X-Sitemap-Version': '1.2',
        'Cache-Control': 'public, max-age=3600' // 缓存1小时
      },
      body: xmlContent
    };
  } catch (error) {
    console.error('XML生成错误:', error);
    return {
      statusCode: 500,
      body: 'Internal Server Error'
    };
  }
};