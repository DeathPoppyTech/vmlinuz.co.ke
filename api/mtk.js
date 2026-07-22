export default function handler(req, res) {
  const userAgent = req.headers['user-agent'] || '';
  const isTerminal = userAgent.includes('curl') || userAgent.includes('Wget');

  if (isTerminal) {
    res.setHeader('Content-Type', 'text/plain');
    return res.status(200).send(rawScript);
  }

  res.setHeader('Content-Type', 'text/html');
  return res.status(200).send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>poppy's bash</title>
      <style>
        body { background: #0d1117; color: #c9d1d9; font-family: monospace; padding: 2rem; }
        .banner { color: #58a6ff; white-space: pre; }
        .cmd { background: #161b22; padding: 1rem; border-radius: 6px; display: inline-block; }
      </style>
    </head>
    <body>
      <div class="banner">
Hosted on vmlinuz.co.ke by poppy &lt;3
      </div>
      <h2>MTKClient Linux Installer</h2>
      <p>Run the following command in your terminal to install:</p>
      <div class="cmd">curl -sSL https://vmlinuz.co.ke/mtk | bash</div>
    </body>
    </html>
  `);
}
