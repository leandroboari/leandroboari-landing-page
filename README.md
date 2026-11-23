# leandroboari-landing-page

Landing page pessoal de Leandro Boari — https://leandroboari.com

Site estático em `public/` servido por um pequeno servidor Node.js (Express) que também
recebe o formulário de contato, valida o **Cloudflare Turnstile** e envia o e-mail por **SMTP** (Nodemailer).

## Estrutura

- `public/` — o site (HTML, CSS, JS, imagens). Só esta pasta é exposta.
- `server.js` — servidor + `POST /api/contact`
- `.env.example` — todas as variáveis de configuração

## Rodando localmente

Requer Node.js 20.6+.

```bash
npm install
cp .env.example .env
npm run dev
```

Abra http://localhost:3000. O `.env.example` vem com as chaves de **teste** do Turnstile
(sempre passam) e sem SMTP: as mensagens aparecem só no log do servidor.

## Deploy no Coolify

O repositório tem um `Dockerfile` pronto (Node 22 Alpine, roda como usuário `node`,
healthcheck em `/healthz`).

1. **New Resource → Public/Private Repository**, escolha este repositório e a branch `main`.
2. **Build Pack:** `Dockerfile`. **Ports Exposes:** `3000`.
3. **Domains:** `https://leandroboari.com` (e `https://www.leandroboari.com`, se quiser).
4. **Environment Variables** (as mesmas do `.env.example`; `HOST`, `PORT` e `TRUST_PROXY`
   já vêm definidas na imagem):
   - `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`
   - `TURNSTILE_HOSTNAMES=leandroboari.com,www.leandroboari.com`
   - `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` (marque como *secret*)
   - `MAIL_FROM`, `MAIL_TO`
   - `CLIENT_IP_HEADER=cf-connecting-ip` **somente** se o DNS estiver com o proxy da Cloudflare ligado
5. **Health Check:** caminho `/healthz`, porta `3000` (o Coolify também lê o `HEALTHCHECK` do Dockerfile).
6. *Deploy*. Os logs do formulário (e erros de SMTP) aparecem na aba **Logs** do recurso.

## Produção (VPS sem Docker)

1. **Turnstile:** no painel da Cloudflare → Turnstile → *Add widget*, domínio `leandroboari.com`.
   Copie a *Site Key* e a *Secret Key* para o `.env`. Opcional: `TURNSTILE_HOSTNAMES=leandroboari.com,www.leandroboari.com`.
2. **SMTP:** preencha `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`,
   `MAIL_FROM` (remetente autorizado no seu provedor) e `MAIL_TO` (onde você quer receber).
   O e-mail chega com *Reply-To* do visitante — é só responder.
3. Instale e rode:

   ```bash
   npm ci --omit=dev
   npm start
   ```

### systemd (exemplo)

```ini
# /etc/systemd/system/leandroboari.service
[Unit]
Description=leandroboari.com
After=network.target

[Service]
WorkingDirectory=/srv/leandroboari-landing-page
ExecStart=/usr/bin/node --env-file=.env server.js
Restart=always
User=www-data
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

### Caddy (HTTPS automático)

```
leandroboari.com, www.leandroboari.com {
    reverse_proxy 127.0.0.1:3000
}
```

Com Nginx, use `proxy_pass http://127.0.0.1:3000;` e `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`.

## Proteções do formulário

- Turnstile validado no servidor (`siteverify`), com checagem opcional de hostname
- Honeypot invisível contra bots simples
- Limite de 5 envios por IP a cada 15 minutos
- Validação de tamanho/formato de nome, e-mail e mensagem; corpo limitado a 16 KB
- Conteúdo escapado no HTML do e-mail; nome sem quebras de linha (sem injeção de cabeçalho)
