# 🚀 Guia de Implantação na VPS (Sem Afetar Outros Projetos)

Este guia explica como hospedar o **VSAIPTV** na sua VPS sem interferir no site, banco de dados ou projetos já existentes.

---

## 1. Escolha da Porta Isolada
Se o seu outro projeto já usa a porta `5000` ou `80/443`, você pode alterar a porta do VSAIPTV criando um arquivo `.env` na pasta `server`:
```bash
PORT=5050
```
*(Ou mantenha `5000` se estiver livre).*

---

## 2. Rodando com PM2 (Processo Isolado)
O PM2 gerencia o processo em segundo plano, reiniciando se a máquina reiniciar, sem tocar nos outros serviços:

```bash
# Na raiz do projeto VSAIPTV na VPS:
npm install pm2 -g
pm2 start ecosystem.config.js
pm2 save
```

Para verificar o status:
```bash
pm2 status
# Você verá "vsaiptv-backend" rodando paralelamente aos seus outros processos!
```

---

## 3. Configuração do Nginx (Subdomínio Exclusivo)
Se você já usa Nginx para o outro site (ex: `meusite.com`), basta criar um subdomínio para o IPTV (ex: `iptv.meusite.com`) apontando para a porta do VSAIPTV:

Crie o arquivo `/etc/nginx/sites-available/vsaiptv`:
```nginx
server {
    server_name iptv.seudominio.com;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Ative o site e recarregue o Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/vsaiptv /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

Certificado SSL Grátis (HTTPS):
```bash
sudo certbot --nginx -d iptv.seudominio.com
```

Pronto! Seu outro site continua funcionando normalmente e o VSAIPTV fica acessível mundialmente em `http://iptv.seudominio.com` ou `http://SEU_IP_VPS:5000`!
No APK VSAIPTV, basta colocar `http://iptv.seudominio.com` ou `http://SEU_IP_VPS:5000` na URL do Servidor!
